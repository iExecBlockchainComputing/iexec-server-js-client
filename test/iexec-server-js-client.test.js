const fs = require('fs');
const createIEXECClient = require('../src/iexec-server-js-client');

console.log = () => {};

const iexec = createIEXECClient({
  login: '',
  password: '',
  hostname: '',
  port: '',
});

test('registerApp() & submitWorkByAppName()', async () => {
  expect.assertions(2);
  const data = fs.readFileSync('./test/Echo');
  const { size } = fs.statSync('./test/Echo');
  const appUID = await iexec.registerApp(data, 'binary', 'amd64', 'linux', size, 'Echo');
  expect(appUID).toBeTruthy();
  const workUID = await iexec.submitWorkByAppName('Echo');
  expect(workUID).toBeTruthy();
}, 15000);

const jwtoken = '';
test('getCookieByJWT()', async () => {
  expect.assertions(1);
  return expect(iexec.getCookieByJWT(jwtoken)).resolves.toBeTruthy();
});
