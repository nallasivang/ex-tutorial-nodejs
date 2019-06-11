DAML Ledger API Node.js bindings POC 

## Introduction

The Ledger API using NodeJS bindings prototype is only for Windows 10. 

The comments or steps in the original version by Digital Asset will not work in Windows 10. The shell commands (only few) differs from the original version and windows 10.

## Changes

The below is the high level changes and will update it later

## (ps)shell-1 for sandbox

daml build
daml sandbox dist/ex-tutorial-nodejs.dar


## shell-2 - Generate template-ids.json using util/fetch-template-ids and execute a contract for Party1

rm  ./template-ids.json ;  node ./util/fetch-template-ids.js -o ./template-ids.json

node ./index.js party1 party2

## shell 3 - Consume the party1 contract by Party2 

node ./index.js party2 party1
