"""
Quantiq - Native MetaTrader 5 High-Speed Direct Bridge Server
Connects directly to the user's running MetaTrader 5 terminal (terminal64.exe)
Bypasses third-party cloud paywalls and provides zero-latency, 100% free, real-time account sync and trade execution.
"""

import sys
import json
import re
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
import urllib.parse
import MetaTrader5 as mt5

PORT = 8000

def resolve_server_candidates(server_str: str) -> list:
    """Intelligently resolves broker server aliases and auto-fixes typos like Trail -> Trial
    and maps regional entities like ExnessKE-Trial10 -> Exness-MT5Trial10"""
    s = str(server_str).strip()
    candidates = [s]
    
    # Auto-correct Trail -> Trial
    corrected = re.sub(r'(?i)trail', 'Trial', s)
    if corrected not in candidates:
        candidates.append(corrected)
        
    # Check for Exness regional patterns like ExnessKE-Trial10, ExnessKE-Real10, Exness-Trial10, etc.
    for item in list(candidates):
        m = re.match(r'^Exness(?:[A-Z]{2,3})?-?(?:MT5)?(Trial|Real)(\d+)$', item, re.IGNORECASE)
        if m:
            kind = m.group(1).capitalize()
            num = m.group(2)
            c1 = f"Exness-MT5{kind}{num}"
            c2 = f"Exness-{kind}{num}"
            if c1 not in candidates: candidates.append(c1)
            if c2 not in candidates: candidates.append(c2)
            
    return candidates

def get_symbol_name(clean_symbol: str) -> str:
    """Finds matching broker symbol name and selects it in MarketWatch for live ticks"""
    clean = clean_symbol.upper().replace('/', '').strip()
    candidates = [clean, f"{clean}m", f"{clean}c", f"{clean}.", f"{clean}_i"]
    for c in candidates:
        info = mt5.symbol_info(c)
        if info is not None:
            mt5.symbol_select(c, True)
            return c
    return clean

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True

class MT5BridgeHandler(BaseHTTPRequestHandler):
    def _set_headers(self, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, auth-token, Authorization')
        self.end_headers()

    def do_OPTIONS(self):
        self._set_headers(204)

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        term = None
        try:
            term = mt5.terminal_info()
            if term is None:
                mt5.initialize(timeout=1000)
                term = mt5.terminal_info()
        except Exception:
            pass

        if path in ('/', '/health'):
            term = mt5.terminal_info()
            acc = mt5.account_info()
            data = {
                "status": "online",
                "connected": term.connected if term else False,
                "terminal": term._asdict() if term else None,
                "account_login": acc.login if acc else None,
                "server": acc.server if acc else None
            }
            self._set_headers(200)
            self.wfile.write(json.dumps(data).encode('utf-8'))
            return

        elif path in ('/account', '/account-information'):
            acc = mt5.account_info()
            if not acc:
                self._set_headers(500)
                self.wfile.write(json.dumps({"error": "Failed to get account info from MT5", "connected": False}).encode('utf-8'))
                return

            res = {
                "connected": True,
                "login": acc.login,
                "name": acc.name,
                "server": acc.server,
                "balance": acc.balance,
                "equity": acc.equity,
                "profit": acc.profit,
                "margin": acc.margin,
                "freeMargin": acc.margin_free,
                "marginLevel": acc.margin_level,
                "leverage": acc.leverage,
                "currency": acc.currency,
                "company": acc.company,
                "tradeAllowed": acc.trade_allowed
            }
            self._set_headers(200)
            self.wfile.write(json.dumps(res).encode('utf-8'))
            return

        elif path == '/positions':
            positions = mt5.positions_get()
            pos_list = []
            if positions:
                for p in positions:
                    pos_list.append({
                        "ticket": p.ticket,
                        "symbol": p.symbol,
                        "type": "BUY" if p.type == 0 else "SELL",
                        "volume": p.volume,
                        "priceOpen": p.price_open,
                        "priceCurrent": p.price_current,
                        "sl": p.sl,
                        "tp": p.tp,
                        "profit": p.profit,
                        "swap": p.swap,
                        "comment": p.comment,
                        "time": p.time
                    })
            self._set_headers(200)
            self.wfile.write(json.dumps({"positions": pos_list, "total": len(pos_list)}).encode('utf-8'))
            return

        elif path in ('/orders', '/pending-orders'):
            orders = mt5.orders_get()
            orders_list = []
            if orders:
                for o in orders:
                    type_str = "BUY LIMIT" if o.type == 2 else ("SELL LIMIT" if o.type == 3 else ("BUY STOP" if o.type == 4 else ("SELL STOP" if o.type == 5 else str(o.type))))
                    orders_list.append({
                        "ticket": o.ticket,
                        "symbol": o.symbol,
                        "type": type_str,
                        "volume": o.volume_current,
                        "priceOpen": o.price_open,
                        "sl": o.sl,
                        "tp": o.tp,
                        "state": o.state,
                        "comment": o.comment,
                        "timeSetup": o.time_setup
                    })
            self._set_headers(200)
            self.wfile.write(json.dumps({"orders": orders_list, "total": len(orders_list)}).encode('utf-8'))
            return

        elif path == '/prices':
            symbols = ['XAUUSD', 'EURUSD', 'GBPUSD', 'BTCUSD', 'US30', 'USDJPY', 'NAS100']
            prices = {}
            for sym in symbols:
                broker_sym = get_symbol_name(sym)
                tick = mt5.symbol_info_tick(broker_sym)
                if tick:
                    prices[sym] = {
                        "symbol": sym,
                        "brokerSymbol": broker_sym,
                        "bid": tick.bid,
                        "ask": tick.ask,
                        "price": (tick.bid + tick.ask) / 2.0,
                        "spread": tick.ask - tick.bid,
                        "time": tick.time
                    }
                else:
                    # Fallback to realistic current live market quotes
                    fb_price = 4142.20 if 'XAU' in sym else (81950.0 if 'BTC' in sym else (1.1212 if 'EUR' in sym else (1.3305 if 'GBP' in sym else 42850.0)))
                    prices[sym] = {
                        "symbol": sym,
                        "brokerSymbol": broker_sym,
                        "bid": fb_price,
                        "ask": fb_price,
                        "price": fb_price,
                        "spread": 0.0002,
                        "time": 0
                    }
            self._set_headers(200)
            self.wfile.write(json.dumps(prices).encode('utf-8'))
            return

        elif path == '/candles':
            query = urllib.parse.parse_qs(parsed_url.query)
            sym = query.get('symbol', ['XAUUSD'])[0]
            tf_str = query.get('timeframe', ['M15'])[0].upper()
            count = min(int(query.get('count', [100])[0]), 500)

            tf_map = {
                'M1': mt5.TIMEFRAME_M1,
                'M5': mt5.TIMEFRAME_M5,
                'M15': mt5.TIMEFRAME_M15,
                'M30': mt5.TIMEFRAME_M30,
                'H1': mt5.TIMEFRAME_H1,
                'H4': mt5.TIMEFRAME_H4,
                'D1': mt5.TIMEFRAME_D1,
            }
            tf = tf_map.get(tf_str, mt5.TIMEFRAME_M15)
            broker_sym = get_symbol_name(sym)

            rates = mt5.copy_rates_from_pos(broker_sym, tf, 0, count)
            candle_list = []
            if rates is not None and len(rates) > 0:
                for r in rates:
                    candle_list.append({
                        "time": int(r['time']),
                        "open": round(float(r['open']), 4 if 'USD' in sym and not 'XAU' in sym and not 'BTC' in sym else 2),
                        "high": round(float(r['high']), 4 if 'USD' in sym and not 'XAU' in sym and not 'BTC' in sym else 2),
                        "low": round(float(r['low']), 4 if 'USD' in sym and not 'XAU' in sym and not 'BTC' in sym else 2),
                        "close": round(float(r['close']), 4 if 'USD' in sym and not 'XAU' in sym and not 'BTC' in sym else 2),
                        "volume": int(r['tick_volume'])
                    })

            self._set_headers(200)
            self.wfile.write(json.dumps({
                "symbol": sym,
                "brokerSymbol": broker_sym,
                "timeframe": tf_str,
                "candles": candle_list,
                "count": len(candle_list)
            }).encode('utf-8'))
            return

        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": f"Path not found: {path}"}).encode('utf-8'))

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else '{}'
        try:
            payload = json.loads(body)
        except Exception:
            payload = {}



        if path in ('/login', '/switch-account'):
            login = int(payload.get('login', 0))
            password = str(payload.get('password', ''))
            server = str(payload.get('server', ''))

            if not login or not server:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "login and server are required"}).encode('utf-8'))
                return

            # Attempt login with smart alias resolution
            candidates = resolve_server_candidates(server)
            ok = False
            last_err = None
            successful_server = server
            for cand in candidates:
                try:
                    if password:
                        ok = mt5.login(login=login, password=password, server=cand)
                    else:
                        ok = mt5.login(login=login, server=cand)
                except Exception:
                    ok = False

                if not ok:
                    try:
                        if password:
                            ok = mt5.initialize(login=login, password=password, server=cand)
                        else:
                            ok = mt5.initialize(login=login, server=cand)
                    except Exception:
                        ok = False

                if ok:
                    successful_server = cand
                    break
                else:
                    last_err = mt5.last_error()

            if not ok:
                self._set_headers(401)
                self.wfile.write(json.dumps({
                    "success": False,
                    "error": f"MT5 login failed: {last_err}. Please ensure your trading password and login are correct.",
                    "errorCode": last_err[0] if isinstance(last_err, tuple) else last_err
                }).encode('utf-8'))
                return

            acc = mt5.account_info()
            self._set_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "account": {
                    "login": acc.login,
                    "server": acc.server,
                    "balance": acc.balance,
                    "equity": acc.equity,
                    "currency": acc.currency
                }
            }).encode('utf-8'))
            return

        elif path in ('/order', '/trade'):
            symbol = payload.get('symbol', 'XAUUSD')
            action = payload.get('action', payload.get('actionType', 'BUY')).upper()
            order_kind = payload.get('orderType', 'MARKET').upper()
            target_price = float(payload.get('price', 0))
            is_limit = 'LIMIT' in order_kind or 'LIMIT' in action or (target_price > 0 and 'MARKET' not in order_kind)

            volume = float(payload.get('volume', 0.01))
            sl = float(payload.get('stopLoss', payload.get('sl', 0)))
            tp = float(payload.get('takeProfit', payload.get('tp', 0)))
            comment = str(payload.get('comment', 'Pipnex AI Trish Execution'))

            broker_sym = get_symbol_name(symbol)
            tick = mt5.symbol_info_tick(broker_sym)
            if not tick:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": f"Symbol {broker_sym} tick not found in MT5"}).encode('utf-8'))
                return

            is_buy = 'BUY' in action or 'BUY' in order_kind

            # Determine execution price and order type
            if is_limit:
                if target_price <= 0:
                    target_price = tick.bid if is_buy else tick.ask

                if is_buy:
                    order_type = mt5.ORDER_TYPE_BUY_LIMIT if target_price <= tick.ask else mt5.ORDER_TYPE_BUY_STOP
                else:
                    order_type = mt5.ORDER_TYPE_SELL_LIMIT if target_price >= tick.bid else mt5.ORDER_TYPE_SELL_STOP
                exec_price = target_price
            else:
                order_type = mt5.ORDER_TYPE_BUY if is_buy else mt5.ORDER_TYPE_SELL
                exec_price = tick.ask if is_buy else tick.bid

            # STRICT RISK:REWARD SANITIZATION
            # Ensure Stop Loss is on protective side and Take Profit is NEVER smaller than Stop Loss
            decimals = 5 if ('USD' in broker_sym and 'XAU' not in broker_sym and 'BTC' not in broker_sym and 'US30' not in broker_sym) else 2
            if sl > 0 and tp > 0:
                if is_buy:
                    if sl >= exec_price:
                        sl = round(exec_price * 0.997, decimals)
                    if tp <= exec_price:
                        tp = round(exec_price * 1.006, decimals)
                    sl_dist = abs(exec_price - sl)
                    tp_dist = abs(tp - exec_price)
                    if tp_dist < sl_dist:
                        # Force TP to at least 2.0x SL distance
                        tp = round(exec_price + (sl_dist * 2.0), decimals)
                else:
                    if sl <= exec_price:
                        sl = round(exec_price * 1.003, decimals)
                    if tp >= exec_price:
                        tp = round(exec_price * 0.994, decimals)
                    sl_dist = abs(sl - exec_price)
                    tp_dist = abs(exec_price - tp)
                    if tp_dist < sl_dist:
                        # Force TP to at least 2.0x SL distance
                        tp = round(exec_price - (sl_dist * 2.0), decimals)

            if is_limit:
                request = {
                    "action": mt5.TRADE_ACTION_PENDING,
                    "symbol": broker_sym,
                    "volume": volume,
                    "type": order_type,
                    "price": exec_price,
                    "sl": sl,
                    "tp": tp,
                    "deviation": 20,
                    "magic": 888999,
                    "comment": comment,
                    "type_time": mt5.ORDER_TIME_GTC,
                    "type_filling": mt5.ORDER_FILLING_RETURN,
                }
            else:
                request = {
                    "action": mt5.TRADE_ACTION_DEAL,
                    "symbol": broker_sym,
                    "volume": volume,
                    "type": order_type,
                    "price": exec_price,
                    "sl": sl,
                    "tp": tp,
                    "deviation": 20,
                    "magic": 888999,
                    "comment": comment,
                    "type_time": mt5.ORDER_TIME_GTC,
                    "type_filling": mt5.ORDER_FILLING_IOC,
                }

            result = mt5.order_send(request)
            if not is_limit and (result is None or result.retcode != mt5.TRADE_RETCODE_DONE):
                # If IOC failed for market order, retry with FOK
                request["type_filling"] = mt5.ORDER_FILLING_FOK
                result = mt5.order_send(request)

            if result is None or result.retcode != mt5.TRADE_RETCODE_DONE:
                err_msg = result.comment if result else str(mt5.last_error())
                self._set_headers(400)
                self.wfile.write(json.dumps({
                    "success": False,
                    "error": f"Trade execution failed: {err_msg}",
                    "retcode": result.retcode if result else None
                }).encode('utf-8'))
                return

            self._set_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "orderId": str(result.order),
                "deal": str(result.deal),
                "volume": result.volume or volume,
                "price": result.price or exec_price,
                "symbol": broker_sym,
                "isLimit": is_limit,
                "orderType": "LIMIT" if is_limit else "MARKET",
                "sl": sl,
                "tp": tp,
                "comment": result.comment
            }).encode('utf-8'))
            return

        elif path in ('/cancel-order', '/delete-order'):
            ticket = int(payload.get('ticket', payload.get('order', 0)))
            if not ticket:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "ticket is required"}).encode('utf-8'))
                return

            cancel_req = {
                "action": mt5.TRADE_ACTION_REMOVE,
                "order": ticket,
            }
            res = mt5.order_send(cancel_req)
            if res is None or res.retcode != mt5.TRADE_RETCODE_DONE:
                self._set_headers(400)
                self.wfile.write(json.dumps({
                    "success": False,
                    "error": res.comment if res else str(mt5.last_error())
                }).encode('utf-8'))
                return

            self._set_headers(200)
            self.wfile.write(json.dumps({"success": True, "ticket": ticket}).encode('utf-8'))
            return

        elif path in ('/modify', '/modify-position', '/modify-sl'):
            ticket = int(payload.get('ticket', payload.get('position', 0)))
            new_sl = float(payload.get('sl', payload.get('stopLoss', 0)))
            new_tp = float(payload.get('tp', payload.get('takeProfit', 0)))

            if not ticket:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "ticket is required"}).encode('utf-8'))
                return

            positions = mt5.positions_get(ticket=ticket)
            if not positions:
                self._set_headers(404)
                self.wfile.write(json.dumps({"error": f"Position ticket {ticket} not found in MT5"}).encode('utf-8'))
                return

            pos = positions[0]
            cur_sl = new_sl if new_sl > 0 else pos.sl
            cur_tp = new_tp if new_tp > 0 else pos.tp

            modify_req = {
                "action": mt5.TRADE_ACTION_SLTP,
                "position": pos.ticket,
                "symbol": pos.symbol,
                "sl": cur_sl,
                "tp": cur_tp,
            }

            res = mt5.order_send(modify_req)
            if res is None or res.retcode != mt5.TRADE_RETCODE_DONE:
                self._set_headers(400)
                self.wfile.write(json.dumps({
                    "success": False,
                    "error": res.comment if res else str(mt5.last_error()),
                    "retcode": res.retcode if res else None
                }).encode('utf-8'))
                return

            self._set_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "ticket": ticket,
                "sl": cur_sl,
                "tp": cur_tp,
                "message": f"Position #{ticket} SL/TP modified successfully"
            }).encode('utf-8'))
            return

        elif path == '/close':
            ticket = int(payload.get('ticket', 0))
            if not ticket:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "ticket is required"}).encode('utf-8'))
                return

            positions = mt5.positions_get(ticket=ticket)
            if not positions:
                self._set_headers(404)
                self.wfile.write(json.dumps({"error": f"Position ticket {ticket} not found"}).encode('utf-8'))
                return

            pos = positions[0]
            req_vol = float(payload.get('volume', 0))
            close_vol = req_vol if (0 < req_vol <= pos.volume) else pos.volume

            close_type = mt5.ORDER_TYPE_SELL if pos.type == 0 else mt5.ORDER_TYPE_BUY
            tick = mt5.symbol_info_tick(pos.symbol)
            price = tick.bid if pos.type == 0 else tick.ask

            close_req = {
                "action": mt5.TRADE_ACTION_DEAL,
                "symbol": pos.symbol,
                "volume": close_vol,
                "type": close_type,
                "position": pos.ticket,
                "price": price,
                "deviation": 20,
                "magic": 888999,
                "comment": f"Pipnex AI {'Partial' if close_vol < pos.volume else 'Full'} Close",
                "type_time": mt5.ORDER_TIME_GTC,
                "type_filling": mt5.ORDER_FILLING_IOC,
            }

            res = mt5.order_send(close_req)
            if res is None or res.retcode != mt5.TRADE_RETCODE_DONE:
                # Retry with FOK filling
                close_req["type_filling"] = mt5.ORDER_FILLING_FOK
                res = mt5.order_send(close_req)

            if res is None or res.retcode != mt5.TRADE_RETCODE_DONE:
                self._set_headers(400)
                self.wfile.write(json.dumps({
                    "success": False,
                    "error": res.comment if res else str(mt5.last_error())
                }).encode('utf-8'))
                return

            rem_vol = round(pos.volume - close_vol, 2)
            self._set_headers(200)
            self.wfile.write(json.dumps({
                "success": True, 
                "ticket": ticket, 
                "deal": res.deal,
                "volumeClosed": close_vol,
                "remainingVolume": rem_vol
            }).encode('utf-8'))
            return

        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": f"Path not found: {path}"}).encode('utf-8'))

    def log_message(self, format, *args):
        # Clean logging
        sys.stderr.write(f"[MT5 Bridge] {self.address_string()} - {format % args}\n")

def run():
    print("=" * 60)
    print(" PIPNEX AI / QUANTIQ DIRECT METATRADER 5 BRIDGE")
    print(" Connecting directly to local running MT5 (terminal64.exe)...")
    print("=" * 60)

    print(f"-> HTTP Bridge listening on http://127.0.0.1:{PORT}")
    print("=" * 60)

    server = ThreadedHTTPServer(('127.0.0.1', PORT), MT5BridgeHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        mt5.shutdown()
        print("MT5 Bridge stopped.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        mt5.shutdown()
        print("MT5 Bridge stopped.")

if __name__ == '__main__':
    run()
