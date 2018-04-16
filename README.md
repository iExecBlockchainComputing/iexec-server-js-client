# iexec-server-js-client

[![Build Status](https://drone.iex.ec//api/badges/iExecBlockchainComputing/iexec-server-js-client/status.svg)](https://drone.iex.ec/iExecBlockchainComputing/iexec-server-js-client) [![npm version](https://badge.fury.io/js/iexec-server-js-client.svg)](https://www.npmjs.com/package/iexec-server-js-client) [![license](https://img.shields.io/github/license/iExecBlockchainComputing/iexec-server-js-client.svg)](LICENSE)

JS client lib to interact with iExec server REST API

## Ressources

* The iExec server API doc: https://serverapi.iex.ec
* [The iExec SDK](https://github.com/iExecBlockchainComputing/iexec-sdk)
* The iExec main documentation: https://docs.iex.ec

## Examples

Below are examples showcasing the use of the library in the most common worklow:

### Create iExec client

iExec server URL:

* tesnet (ropsten / rinkeby / kovan): `https://testxw.iex.ec:443`
* mainnet: `https://mainxw.iex.ec:443`

```js
const createIEXECClient = require('iexec-server-js-client');
const iexec = createIEXECClient({ server: 'https://testxw.iex.ec:443' });
```

### Auth

Authenticate before hitting iExec API:

```js
iexec.auth(ethProvider, accountAddress).then(({ jwtoken, cookie }) => {
  console.log(jwtoken); // this is given by auth.iex.ec server
  console.log(cookie); // this is given by iExec server
  // hit iExec server API
  iexec.getAppByName(deployTxHash).then(console.log); // print app description from deploy txHash
  iexec.getWorkByExternalID(submitTxHash).then(console.log); // print work description from submit txHash
});
```

If you already have your JWT token, no need to do full auth (avoid wallet signing):

```js
iexec.getCookieByJWT('my_jwt_token').then(cookie => {
  // hit iExec server API
  iexec.getByUID(workUID).then(console.log); // print work description
});
```

### Submit a work

Call the dapp smart contract "iexecSubmit" method to submit a work:

```js
const oracleJSON = require('iexec-oracle-contract/build/contracts/IexecOracle.json');

const oracleContract = ethProvider
  .contract(oracleJSON.abi, oracleJSON.unlinked_binary, { from: account })
  .at(oracleJSON.networks[chainID].address);
const callbackPrice = await  oracleContract.callbackPrice();

const dappContract = ethProvider
  .contract(dappSubmitABI, '', { from: account })
  .at(dappAddress);

const txHash = await dappContract.iexecSubmit(work, {
  value: callbackPrice[0].toNumber(),
});
```

### Wait for work result

After submitting a work through Ethereum, use the transaction hash (txHash) to wait for the work result:

```js
iexec
  .waitForWorkResult(oracleContract.getWork, txHash)
  .then(workResultURI => iexec.createDownloadURI(workResultURI))
  .then(console.log); // let user open this URL in the browser to download the work result
```
