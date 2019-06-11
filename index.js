
// Copyright (c) 2019, Digital Asset (Switzerland) GmbH and/or its affiliates. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

const ledger = require('@digitalasset/daml-ledger');
const templateIds = require('./template-ids.json');

const PING = templateIds['PingPong:Ping'];
const PONG = templateIds['PingPong:Pong'];

const daml = ledger.daml;

const uuidv4 = require('uuid/v4');

let [, , sender, receiver, host, port] = process.argv;
host = host || 'localhost';
port = port || 6865;
if (!sender || !receiver) {
    console.log('Missing sender and/or receiver arguments, exiting.');
    process.exit(-1);
}

ledger.DamlLedgerClient.connect({ host: host, port: port }, (error, client) => {
    if (error) throw error;

    const filtersByParty = {};
    filtersByParty[sender] = { inclusive: { templateIds: [PING, PONG] } };
    const transactionFilter = { filtersByParty: filtersByParty };

    processActiveContracts(transactionFilter, react, offset => {
        listenForTransactions(offset, transactionFilter, react);
        createFirstPing();
    });

    function createFirstPing() {
        const request = {
            commands: {
                applicationId: 'PingPongApp',
                workflowId: `Ping-${sender}`,
                commandId: uuidv4(),
                ledgerEffectiveTime: { seconds: 0, nanoseconds: 0 },
                maximumRecordTime: { seconds: 5, nanoseconds: 0 },
                party: sender,
                list: [{
                    commandType: 'create',
                    templateId: PING,
                    arguments: {
                        fields: {
                            sender: daml.party(sender),
                            receiver: daml.party(receiver),
                            count: daml.int64(0)
                        }
                    }
                }]
            }
        };
        client.commandClient.submitAndWait(request, (error, _) => {
            if (error) throw error;
            console.log(`Created Ping contract from ${sender} to ${receiver}.`);
        });
    }

    function listenForTransactions(offset, transactionFilter, callback) {
        console.log(`${sender} starts reading transactions from offset: ${offset}.`);
        const request = {
            begin: { offsetType: 'boundary', boundary: ledger.LedgerOffsetBoundaryValue.END },
            filter: transactionFilter
        };
        const transactions = client.transactionClient.getTransactions(request);
        transactions.on('data', response => {
            for (const transaction of response.transactions) {
                const events = [];
                for (const event of transaction.events) {
                    if (event.eventType === 'created') {
                        events.push(event);
                    }
                }
                if (events.length > 0) {
                    callback(transaction.workflowId, events);
                }
            }
        });
        transactions.on('error', error => {
            console.error(`${sender} encountered an error while processing transactions!`);
            console.error(error);
            process.exit(-1);
        });
    }

    function processActiveContracts(transactionFilter, callback, onComplete) {
        console.log(`processing active contracts for ${sender}`);
        const request = { filter: transactionFilter };
        const activeContracts = client.activeContractsClient.getActiveContracts(request);
        let offset = undefined;
        activeContracts.on('data', response => {
            if (response.activeContracts) {
                const events = [];
                for (const activeContract of response.activeContracts) {
                    events.push(activeContract);
                }
                if (events.length > 0) {
                    callback(response.workflowId, events);
                }
            }

            if (response.offset) {
                offset = response.offset;
            }
        });

        activeContracts.on('error', error => {
            console.error(`${sender} encountered an error while processing active contracts!`);
            console.error(error);
            process.exit(-1);
        });

        activeContracts.on('end', () => onComplete(offset));
    }

    function react(workflowId, events) {
        const reactions = [];
        for (const event of events) {
            const { receiver: { party: receiver }, count: { int64: count } } = event.arguments.fields;
            if (receiver === sender) {
                const templateId = event.templateId;
                const contractId = event.contractId;
                const reaction = templateId.moduleName === PING.moduleName && templateId.entityName === PING.entityName ? 'ReplyPong' : 'ReplyPing';
                console.log(`${sender} (workflow ${workflowId}): ${reaction} at count ${count}`);
                reactions.push({
                    commandType: 'exercise',
                    templateId: templateId,
                    contractId: contractId,
                    choice: reaction,
                    argument: { valueType: 'record', fields: {} }
                });
            }
        }
        if (reactions.length > 0) {
            const request = {
                commands: {
                    applicationId: 'PingPongApp',
                    workflowId: workflowId,
                    commandId: uuidv4(),
                    ledgerEffectiveTime: { seconds: 0, nanoseconds: 0 },
                    maximumRecordTime: { seconds: 5, nanoseconds: 0 },
                    party: sender,
                    list: reactions
                }
            }
            client.commandClient.submitAndWait(request, error => {
                if (error) throw error;
            });
        }
    }

});
