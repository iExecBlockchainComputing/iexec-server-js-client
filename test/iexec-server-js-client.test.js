const fs = require('fs');
const xml2js = require('xml2js-es6-promise');
const createIEXECClient = require('../src/iexec-server-js-client');

console.log = () => {};
const {
  XW_LOGIN, XW_PWD, XW_SERVER, JWTOKEN,
} = process.env;
const login = '' || XW_LOGIN;
const password = '' || XW_PWD;
const server = '' || XW_SERVER;
const jwtoken = '' || JWTOKEN;
const iexec = createIEXECClient({ login, password, server });

test('registerApp() & submitWorkByAppName()', async () => {
  expect.assertions(2);
  const data = fs.readFileSync('./test/Echo');
  const { size } = fs.statSync('./test/Echo');
  const appUID = await iexec.registerApp(data, size, {
    name: 'Echo',
    type: 'BINARY',
    cpu: 'AMD64',
    os: 'LINUX',
  }, { name: 'Echo' });
  expect(appUID).toBeTruthy();
  const workUID = await iexec.submitWorkByAppName('Echo', { cmdline: 'Hello World' });
  expect(workUID).toBeTruthy();
}, 15000);

test('getCookieByJWT()', async () => {
  expect.assertions(1);
  return expect(iexec.getCookieByJWT(jwtoken)).resolves.toBeTruthy();
});

const dataXML = '<xwhep><data><uid>9d2e2ae0-be3b-4bb0-ad45-e7e4aeb0bc4e</uid><owneruid>a98c4179-c756-4678-839d-eeae6ca36f6f</owneruid><accessrights>0x755</accessrights><name>fileName</name><links>0</links><insertiondate>2017-12-18 10:01:06</insertiondate><status>ERROR</status><type>BINARY</type><cpu>AMD64</cpu><os>LINUX</os><uri>xw://xw.iex.ec/9d2e2ae0-be3b-4bb0-ad45-e7e4aeb0bc4e</uri><sendtoclient>false</sendtoclient><replicated>false</replicated></data></xwhep>';
test('getFieldValue(dataXML)', async () => {
  const data = await xml2js(dataXML);
  expect(iexec.getFieldValue(data, 'uid')).toBe('9d2e2ae0-be3b-4bb0-ad45-e7e4aeb0bc4e');
  expect(iexec.getFieldValue(data, 'status')).toBe('ERROR');
  expect(iexec.getFieldValue(data, 'uri')).toBe('xw://xw.iex.ec/9d2e2ae0-be3b-4bb0-ad45-e7e4aeb0bc4e');
});

const appXML = '<xwhep><app><uid>18bb115a-8740-46f2-b907-3aab499de920</uid><owneruid>839bad45-893c-4196-a11f-924c04352ce4</owneruid><accessrights>0x755</accessrights><name>0xe0536a1e27e069a379462a110555154dbccd102e</name><isservice>false</isservice><type>DEPLOYABLE</type><minfreemassstorage>0</minfreemassstorage><avgexectime>16005</avgexectime><minmemory>0</minmemory><mincpuspeed>0</mincpuspeed><nbjobs>1</nbjobs><pendingjobs>0</pendingjobs><runningjobs>0</runningjobs><linux_amd64uri>xw://xw.iex.ec/47a7a8f2-fa50-4f20-a0cf-ea6ff778c7c4</linux_amd64uri></app></xwhep>';
test('getFieldValue(appXML)', async () => {
  const app = await xml2js(appXML);
  expect(iexec.getFieldValue(app, 'uid')).toBe('18bb115a-8740-46f2-b907-3aab499de920');
  expect(iexec.getFieldValue(app, 'accessrights')).toBe('0x755');
  expect(iexec.getFieldValue(app, 'linux_amd64uri')).toBe('xw://xw.iex.ec/47a7a8f2-fa50-4f20-a0cf-ea6ff778c7c4');
});

const uid = '47a7a8f2-fa50-4f20-a0cf-ea6ff778c7c4';
test('uri2uid()', () => expect(iexec.uri2uid(iexec.uid2uri(uid))).toBe(uid));
