async function inspectFormFields() {
  const mt5Url = 'https://pipnex-ai.com/assets/MT5AccountConnection-BzLGh-tS.js';
  const res = await fetch(mt5Url);
  const code = await res.text();

  // Find form labels: "Broker", "Server", "Login", "Password"
  const formIdx = code.indexOf('Server Name') !== -1 ? code.indexOf('Server Name') : code.indexOf('server');
  // Search for input placeholders
  const matches = code.match(/placeholder:\s*["'][^"']+["']/g) || [];
  console.log('Placeholders found in MT5AccountConnection:', matches);

  const labels = code.match(/children:\s*["'][^"']{2,30}["']/g) || [];
  console.log('Labels sample in MT5AccountConnection:', labels.slice(0, 30));
}

inspectFormFields();
