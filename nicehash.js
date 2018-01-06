const https = require('https');
const config = require('./config.json');

if (process.argv[2]) {
    const _minerConf = require('./' + process.argv[2] + '.json');

    for (const key in _minerConf) {
        if (_minerConf.hasOwnProperty(key)) {
            config[key] = _minerConf[key];
        }
    }
}

let childProcess;
let childAlgo;
let prevChild;

let running = true;
let killing = false;
let lastChange = 0;

let conversionRate = 0,
    currencySymbol = 'e';

let first = true;
let cursorPos = 0,
    cursorPosAfterDetails = 5;

const algoKeys = {};
const _algoKeys = require('./nicehashAlgos.json');

for (const key in _algoKeys) {
    if (config.algorithms.hasOwnProperty(key)) {
        algoKeys[key] = _algoKeys[key];
    }
}

// Some ansi coloring strings

/* eslint-disable */
const ttyReset = '\x1b[0m',
    ttyBright = '\x1b[1m',
    ttyDim = '\x1b[2m',
    ttyUnderscore = '\x1b[4m',
    ttyBlink = '\x1b[5m',
    ttyReverse = '\x1b[7m',
    ttyHidden = '\x1b[8m',
    fgBlack = '\x1b[30m',
    fgRed = '\x1b[31m',
    fgGreen = '\x1b[32m',
    fgYellow = '\x1b[33m',
    fgBlue = '\x1b[34m',
    fgMagenta = '\x1b[35m',
    fgCyan = '\x1b[36m',
    fgWhite = '\x1b[37m',
    bgBlack = '\x1b[40m',
    bgRed = '\x1b[41m',
    bgGreen = '\x1b[42m',
    bgYellow = '\x1b[43m',
    bgBlue = '\x1b[44m',
    bgMagenta = '\x1b[45m',
    bgCyan = '\x1b[46m',
    bgWhite = '\x1b[47m';
/* eslint-enable */

const curScreen = [];
const writeLine = function(str, x, y, screen) {
    if (typeof x !== 'undefined' || typeof y !== 'undefined') {
        process.stdout.cursorTo(x, y);
        if (screen) {
            process.stdout.clearScreenDown();
        } else {
            process.stdout.clearLine();
        }
    }

    process.stdout.write(ttyReset + str);

    const lines = str.split('\n');

    const yPos = typeof y === 'number' ? y : cursorPos;

    lines.map((line, i) => {
        if (line) {
            curScreen[yPos + i] = ttyReset + line;
        }
    });
};

process.stdout.on('resize', () => {
    process.stdout.cursorTo(0, 0);
    process.stdout.clearScreenDown();
    for (let i = 0, iLen = curScreen.length; i < iLen; i++) {
        if (curScreen[i]) {
            writeLine(curScreen[i], 0, i);
        }
    }
});

writeLine('          *** NodeNicehashMiner by Markus Haverinen ***', 0, 0, true);
writeLine(
    ttyDim + '      BTC Donation address: ' + ttyReset + ttyUnderscore + '3CC35VEKMd861aWWSgGqPyRurc4JXCTpsX',
    0,
    1
);

const getProfitString = profit => {
    return `${(profit * conversionRate).toFixed(2)}${currencySymbol}/day (${(profit * 1000).toFixed(4)}mBTC/day)`;
};

const osValue = data => {
    const os = process.platform;

    return typeof data === 'object' ? data[os] || data : data;
};

let currentAlgoStr = '',
    currentAlgoName,
    currentAlgoPrice = 0,
    currentProfit = '',
    hashSpeedObj = {},
    hashSpeed,
    algoDifficulty,
    lastHash,
    lastHashString,
    lastBlock,
    lastBlockString;

const updateRunning = function(name, price) {
    if (name) {
        const now = new Date();

        currentAlgoName = name;
        currentAlgoStr = `\tStarted ${name}: ${fgWhite}${now.toLocaleString()}${ttyReset} with: ${fgGreen}${getProfitString(
            price
        )}`;
    }

    writeLine(currentAlgoStr || '', 0, cursorPosAfterDetails + 1);
};

const updateCurrentProfit = function(profit) {
    if (profit) {
        const now = new Date();

        currentAlgoPrice = profit;
        currentProfit = `\tCurrent profit: ${fgGreen}${getProfitString(
            profit
        )}${ttyReset} (${fgCyan}${now.toLocaleTimeString()}${ttyReset})`;
    }

    writeLine(currentProfit || '', 0, cursorPosAfterDetails + 2);
};

const updateSpeed = function(algo, miner, line, deviceId, deviceName, speed, unit) {
    if (typeof deviceId !== 'undefined') {
        hashSpeedObj[deviceId + deviceName] = {
            device: deviceName + ' #' + deviceId,
            speed: speed + ' ' + unit
        };

        const keys = Object.keys(hashSpeedObj).sort();

        hashSpeed = '';
        for (let i = 0, iLen = keys.length; i < iLen; i++) {
            const obj = hashSpeedObj[keys[i]];

            hashSpeed = (hashSpeed ? `${hashSpeed}, ` : '') + `${obj.device} ${fgWhite}${obj.speed}${ttyReset}`;
        }
    }

    if (hashSpeed) {
        writeLine(`\tCurrent speed: ${hashSpeed}`, 0, cursorPosAfterDetails + 3);
    } else {
        writeLine('\tCurrent speed: Not yet detected', 0, cursorPosAfterDetails + 3);
    }
};

const updateDifficulty = function(algo, miner, line, difficulty, difficulty2, difficulty3) {
    if (difficulty || difficulty3) {
        algoDifficulty = difficulty3 ? difficulty3 : difficulty + ' ' + difficulty2;
    }

    if (algoDifficulty) {
        writeLine(`\tDifficulty: ${fgYellow}${algoDifficulty || 'undefined'}`, 0, cursorPosAfterDetails + 4);
    } else {
        writeLine('\tDifficulty: Not yet detected', 0, cursorPosAfterDetails + 4);
    }
};

let prevAccepted = 0;

const updateAccepted = function(algo, miner, line, accepted, total, diff, speed, unit) {
    //, status
    if (parseInt(accepted) > prevAccepted) {
        lastHash = new Date();
        prevAccepted = parseInt(accepted);
    }

    if (lastHash && prevAccepted === parseInt(accepted)) {
        lastHashString = `${currentAlgoName} - ${fgCyan}${lastHash.toLocaleTimeString()}: ${ttyReset}${accepted}/${total}: ${fgWhite}${speed} ${unit}${ttyReset} with ${getProfitString(
            currentAlgoPrice
        )}`;
    }

    if (lastHashString) {
        writeLine(`\tLast accepted: ${lastHashString}`, 0, cursorPosAfterDetails + 5);
    } else {
        writeLine('\tLast accepted: None yet', 0, cursorPosAfterDetails + 5);
    }
};

const updateBlock = function(algo, miner, line, blockId, diff) {
    // not working for what ever reason...
    if (line) {
        lastBlock = new Date();
        lastBlockString = `${blockId}, diff ${diff} (${lastBlock.toLocaleTimeString()})`;
    }

    if (lastBlockString) {
        writeLine(`\tLast block: ${lastBlockString}`, 0, cursorPosAfterDetails + 6);
    }
};

let log = '';
const updateLog = function(str) {
    const joinedStr = log + String(str || '');
    const logLines = joinedStr.trim().split('\n');

    let newLog = '';
    let lineLen = 0;

    for (let i = 21, iLen = 1; i >= iLen; i--) {
        if (logLines[logLines.length - i]) {
            lineLen = Math.max(lineLen, ('\t' + logLines[logLines.length - i] + '\t').length);
            newLog = newLog + logLines[logLines.length - i] + '\n';
        }
    }
    log = newLog;

    let splitter = '';

    for (let i = 0; i < lineLen; i++) {
        splitter = splitter + '-';
    }

    writeLine(`${childAlgo || 'Miner'} log:`, 0, cursorPosAfterDetails + 8);
    writeLine(
        splitter + '\n\n' + '\t' + newLog.split('\n').join('\n\t') + '\n' + splitter,
        0,
        cursorPosAfterDetails + 9,
        true
    );
};

const updateValues = function() {
    updateRunning();
    updateCurrentProfit();
    updateSpeed();
    updateDifficulty();
    updateAccepted();
    updateBlock();
    updateLog();
};

const algoRunning = {};
let previousProfits;

const getProfitData = function(cb) {
    https
        .get('https://api.nicehash.com/api?method=stats.global.current&location=' + config.location, resp => {
            let data = '';

            // A chunk of data has been recieved.
            resp.on('data', chunk => {
                data = data + chunk;
            });

            // The whole response has been received. Print out the result.
            resp.on('end', () => {
                let values;

                const items = {};

                try {
                    values = JSON.parse(data);

                    for (const key in algoKeys) {
                        if (algoKeys.hasOwnProperty(key)) {
                            items[key] = values.result.stats[algoKeys[key]];
                        }
                    }
                } catch (e) {
                    cb(resp.statusCode + ': ' + resp.statusMessage);
                    return;
                }

                const multiplier = 24 * 60 * 60 / 100000000000;

                //console.log(values.result.stats);

                const profit = {};
                const algomap = {};

                Object.keys(algoKeys).map(key => {
                    profit[key] =
                        config.algorithms[key].speed *
                        config.algorithms[key].multiplier *
                        parseFloat(items[key].price, 10) *
                        multiplier;

                    algomap[profit[key]] = key;
                });

                if (JSON.stringify(profit) === JSON.stringify(previousProfits)) {
                    cb('nochange');
                    return;
                }

                const keys = Object.keys(algomap).sort(function(a, b) {
                    return parseFloat(b) - parseFloat(a);
                });

                writeLine(`Mining in ${config.server} as ${config.wallet}.${config.miner}`, 0, 3);
                writeLine('Status for algorithms at ' + new Date().toLocaleTimeString() + ':', 0, 4, true);
                cursorPos = 5;

                keys.map(key => {
                    const algo = algomap[key];
                    const compared = previousProfits ? profit[algo] - previousProfits[algo] : 0;

                    writeLine(
                        `\t${algo}${algo.length < 8 ? '\t\t' : '\t'} ${getProfitString(profit[algo])} ${compared >= 0
                            ? compared === 0 ? '- no change' : fgGreen + '^'
                            : fgRed + 'v'} ${compared !== 0 ? getProfitString(compared) : ''}${ttyReset}`,
                        0,
                        cursorPos
                    );
                    cursorPos++;
                });

                cursorPos++;

                cursorPosAfterDetails = cursorPos;

                // console.log(keys, profit[keys[0]], profit[keys[0]] - profit[childAlgo || keys[0]]);

                const algo = algomap[keys[0]],
                    nextAlgo = algomap[keys[1]];

                if (algo !== childAlgo) {
                    const diff = profit[algo] - profit[childAlgo || nextAlgo];

                    if (childAlgo) {
                        writeLine(
                            `${childAlgo} is making ${getProfitString(
                                profit[childAlgo]
                            )} and ${algo} is more profitable by ${getProfitString(diff)}`,
                            0,
                            cursorPosAfterDetails
                        );
                    } else if (!first) {
                        writeLine(`${algo} is more profitable by ${getProfitString(diff)}`, 0, cursorPosAfterDetails);
                    } else {
                        writeLine(`${algo} is most profitable by ${getProfitString(diff)}`, 0, cursorPosAfterDetails);
                    }
                } else {
                    const diff = profit[algo] - profit[nextAlgo];

                    if (childAlgo) {
                        writeLine(
                            `${childAlgo} is making ${getProfitString(
                                profit[childAlgo]
                            )} and is the most profitable by ${fgGreen}${getProfitString(diff)}`,
                            0,
                            cursorPosAfterDetails
                        );
                    } else {
                        writeLine(`${algo} is most profitable by ${getProfitString(diff)}`, 0, cursorPosAfterDetails);
                    }
                }

                writeLine('\n');
                cursorPos++;

                first = false;

                updateValues();
                updateLog('');

                cb(0, algo, profit[algo] - profit[childAlgo || nextAlgo], profit[algo]);

                if (typeof previousProfits === 'undefined' || previousProfits[childAlgo] !== profit[childAlgo]) {
                    updateCurrentProfit(profit[childAlgo || algo]);
                }

                previousProfits = profit;
            });
        })
        .on('error', err => {
            writeLine('Error: ' + err.message, 0, cursorPosAfterDetails + 8);
            cb(err);
        });
};

const { spawn } = require('child_process');

const startChild = {};

const getParams = function(algoConfig, deviceConfig = {}) {
    if (config.miners.hasOwnProperty(algoConfig.miner)) {
        const miner = config.miners[algoConfig.miner];

        return [
            osValue(miner.executable),
            (osValue(miner.parameters) +
                ' ' +
                ((typeof deviceConfig.device !== 'undefined' ? osValue(miner.devices) : {})[deviceConfig.device] || '')
            )
                .replace('[algorithm]', algoConfig.server)
                .replace('[host]', algoConfig.server)
                .replace('[server]', config.server)
                .replace('[port]', algoConfig.port)
                .replace('[wallet]', config.wallet)
                .replace('[miner]', config.miner)
                .replace('[intensity]', algoConfig.intensity)
                .replace('[cpu]', deviceConfig.cpu)
                .replace('[gpuId]', deviceConfig.gpu)
                .replace('[mem-clock]', algoConfig.gpuMemClock)
                .replace('[gpu-clock]', algoConfig.gpuClock)
                .replace('[power-limit]', algoConfig.powerLimit)
                .replace('[temp-limit]', algoConfig.tempLimit)
                .trim()
                .split(' ')
        ];
    }

    return ['echo', ['Undefined miner ' + algoConfig.miner]];
    // switch (algoConfig.miner) {
    //     case 'ccminer':
    //         return [
    //             'ccminer/ccminer',
    //             [
    //                 '--retries=0',
    //                 '--intensity=' + algoConfig.intensity,
    //                 '--cpu-priority=5',
    //                 '--algo=' + algoConfig.algo,
    //                 '-o',
    //                 'stratum+tcp://' + algoConfig.server + '.' + config.server + ':' + algoConfig.port,
    //                 '-u',
    //                 config.wallet + '.' + config.miner,
    //                 '-p',
    //                 'x'
    //             ]
    //         ];
    //     case 'ethminer':
    //         return [
    //             'ethminer/ethminer',
    //             [
    //                 '-U',
    //                 '-SP',
    //                 '2',
    //                 '-S',
    //                 algoConfig.server + '.' + config.server + ':' + algoConfig.port,
    //                 '-O',
    //                 config.wallet + '.' + config.miner
    //             ]
    //         ];
    //     case 'nheqminer':
    //         return [
    //             'eqminer/nheqminer',
    //             [
    //                 '-l',
    //                 algoConfig.server + '.' + config.server + ':' + algoConfig.port,
    //                 '-u',
    //                 config.wallet + '.' + config.miner,
    //                 '-cd',
    //                 '0',
    //                 '-cb',
    //                 '32',
    //                 '-ct',
    //                 '256'
    //             ]
    //         ];
    //     default:
    //         return [];
    // }
};

const matchLines = function(algo, data) {
    const lines = String(data)
        .trim()
        .split('\n');

    const miner = config.miners[config.algorithms[algo].miner];

    const accepted = miner.accepted && new RegExp(osValue(miner.accepted) || '', 'gm');
    const difficulty = miner.difficulty && new RegExp(osValue(miner.difficulty) || '', 'gm');
    const block = miner.block && new RegExp(osValue(miner.block) || '', 'gm');
    const gpu = miner.gpu && new RegExp(osValue(miner.gpu) || '', 'gm');
    const cpu = miner.cpu && new RegExp(osValue(miner.cpu) || '', 'gm');

    lines.map(line => {
        if (accepted && accepted.test(line)) {
            accepted.lastIndex = 0;
            const values = accepted.exec(line);

            updateAccepted(algo, miner, ...values);
        }
        if (difficulty && difficulty.test(line)) {
            difficulty.lastIndex = 0;
            const values = difficulty.exec(line);

            updateDifficulty(algo, miner, ...values);
            writeLine('difficulty detected: ' + JSON.stringify(values), 0, 0);
        }
        if (block && block.test(line)) {
            block.lastIndex = 0;
            const values = block.exec(line);

            updateBlock(algo, miner, ...values);
            writeLine('block detected', 0, 1);
        }
        if ((gpu && gpu.test(line)) || (cpu && cpu.test(line))) {
            if (line.indexOf('Intensity') !== -1) {
                return;
            }

            if (gpu) {
                gpu.lastIndex = 0;
            }
            if (cpu) {
                cpu.lastIndex = 0;
            }

            let values;

            if (gpu.test(line)) {
                gpu.lastIndex = 0;
                values = gpu.exec(line);
            } else {
                values = cpu.exec(line);
            }

            // console.log('\n\n\n\n\n line:', line);
            // console.log('gpu', gpu.test(line), gpu);
            // console.log('values', JSON.stringify(values));

            updateSpeed(algo, miner, ...values);
        }
    });

    // lines.map(line => {
    //     if (line.indexOf('accepted') !== -1) {
    //         updateSpeed(
    //             line
    //             .split('), ')[1]
    //             .split('yes')[0]
    //             .trim()
    //         );
    //     } else if (line.indexOf('Stratum difficulty') !== -1) {
    //         updateSpeed(undefined, line.split('Stratum difficulty set to ')[1].trim());
    //     }
    // });
};

const followChild = function(algo) {
    childProcess.stdout.on('data', data => {
        updateLog(data);

        matchLines(algo, data);
    });

    childProcess.stderr.on('data', data => {
        updateLog(data);

        matchLines(algo, data);
        // console.log(`stdout: ${data}`);
        // const lines = String(data).split('\n');

        // lines.map(line => {
        //     switch (algo) {
        //         case 'DaggerHashimoto':
        //             if (line.indexOf('Speed') !== -1) {
        //                 updateSpeed(
        //                     line
        //                         .split('Speed ')[1]
        //                         .split('gpu')[0]
        //                         .trim()
        //                 );
        //             } else if (line.indexOf('Stratum difficulty') !== -1) {
        //                 updateSpeed(undefined, line.split('Stratum difficulty set to ')[1].trim());
        //             }
        //             break;
        //         default:
        //             writeLine('\n' + line);
        //             break;
        //     }
        // });
    });

    childProcess.on('close', (code, signal) => {
        if (signal !== 'SIGINT' && signal !== 'SIGSEGV' && running) {
            writeLine(
                `Child process terminated due to receipt of signal ${signal}; restart...`,
                0,
                cursorPosAfterDetails + 8
            );

            prevChild = childAlgo;
            setTimeout(function() {
                if (running) {
                    startChild[prevChild]();
                }
            }, 5000);
        }
        algoRunning[childAlgo] = false;
    });
};

const setupAlgo = function(key) {
    startChild[key] = function(_price, device) {
        if (!algoRunning[key]) {
            lastHash = undefined;
            const price = _price || currentAlgoPrice;

            currentAlgoStr = '';
            currentAlgoName = '';
            currentProfit = '';
            algoDifficulty = '';
            hashSpeed = '';
            hashSpeedObj = {};
            lastHash = undefined;
            lastHashString = '';
            lastBlock = undefined;
            lastBlockString = '';
            log = '';
            prevAccepted = 0;

            if (_price) {
                updateRunning(key, price);
                updateCurrentProfit(price);
            }

            childAlgo = key;
            prevChild = key;
            const params = getParams(config.algorithms[key], device);

            childProcess = spawn(params[0], params[1]);
            algoRunning[key] = true;
            followChild(key);
        }
    };
};

for (const _key in algoKeys) {
    if (algoKeys.hasOwnProperty(_key)) {
        setupAlgo(_key);
    }
}

const killChild = function(cb, force) {
    if (!childProcess.killed && algoRunning[prevChild]) {
        childProcess.on('close', (code, signal) => {
            if (typeof cb === 'function') {
                cb(code, signal);
            }
        });
        childProcess.kill(force ? 'SIGKILL' : 'SIGINT');
    } else if (typeof cb === 'function') {
        cb();
    }
};

let retryProfitCheckTo;

const changeMiner = function retry() {
    const algoMineTimeCheck = Date.now() - lastChange > (config.mineAtLeast || 3 * 60 * 1000);

    if (
        algoMineTimeCheck &&
        lastHash &&
        Date.now() - lastHash.getTime() > 20000 &&
        Date.now() - lastHash.getTime() < 10 * 60 * 1000
    ) {
        clearTimeout(retryProfitCheckTo);
        retryProfitCheckTo = setTimeout(retry, 1000);
        writeLine('Waiting for accepted share...', 0, cursorPosAfterDetails + 7);
        return;
    }

    if (running && !killing && algoMineTimeCheck) {
        clearTimeout(retryProfitCheckTo);
        retryProfitCheckTo = undefined;
        getProfitData(function(err, algo, difference, price) {
            if (!err && running) {
                let priceSwitch = false;

                if (conversionRate !== 0) {
                    priceSwitch = difference * conversionRate > (config.changeThreshold || 0.1);
                } else {
                    priceSwitch = difference * 1000 > (config.changeThresholdBtc || 0.02);
                }
                // console.log('Run with', algo, (difference * 1000).toFixed(4));
                if ((childAlgo !== algo && priceSwitch) || typeof childAlgo === 'undefined') {
                    if (typeof childAlgo !== 'undefined' && childProcess) {
                        writeLine(
                            'Kill child ' + childAlgo + ' before starting new...\n',
                            0,
                            cursorPosAfterDetails + 8
                        );
                        running = false;
                        killChild(function(code, signal) {
                            try {
                                writeLine('Child killed: ' + String(signal), 0, cursorPosAfterDetails + 8);
                            } catch (e) {
                                writeLine('Child killed', 0, cursorPosAfterDetails + 8);
                            }

                            lastChange = Date.now();
                            startChild[algo](price);
                            running = true;
                        }, true);
                    } else {
                        lastChange = Date.now();
                        startChild[algo](price);
                    }
                }
            } else if (err === 'nochange') {
                writeLine(
                    'No change in profit data (' + new Date().toLocaleTimeString() + ')...',
                    0,
                    cursorPosAfterDetails + 7
                );
            } else {
                writeLine('Error while fetching profit data:', 0, cursorPosAfterDetails + 8);
                try {
                    writeLine(JSON.stringify(err), 0, cursorPosAfterDetails + 9, true);
                } catch (e) {}
            }
        });
    } else if (!algoMineTimeCheck) {
        const left = (config.mineAtLeast || 3 * 60 * 1000) - (Date.now() - lastChange);
        const min = Math.floor((left - left % 60000) / 60000);
        const sec = Math.round((left % 60000) / 1000);

        writeLine(
            `${childAlgo} change cool off: ${min ? min + ' min' : ''} ${sec ? sec + ' s' : ''}`,
            0,
            cursorPosAfterDetails + 7
        );
        if (typeof to === 'undefined') {
            retryProfitCheckTo = setTimeout(changeMiner, left + 100);
        }
    }
};

const getBtcPrices = function retry() {
    try {
        https.get('https://blockchain.info/ticker', resp => {
            let data = '';

            // A chunk of data has been recieved.
            resp.on('data', chunk => {
                data = data + chunk;
            });

            // The whole response has been received. Print out the result.
            resp
                .on('end', () => {
                    let values;

                    try {
                        values = JSON.parse(data);
                    } catch (e) {
                        return;
                    }

                    conversionRate = values[config.currency || 'EUR']['15m'];
                    currencySymbol = values[config.currency || 'EUR'].symbol;
                })
                .on('error', err => {
                    writeLine('Error: ' + err.message, 0, cursorPosAfterDetails + 8);
                    setTimeout(retry, 30000);
                });
        });
    } catch (e) {
        writeLine('Error: ' + e, 0, cursorPosAfterDetails + 8);
        setTimeout(retry, 30000);
    }
};

process.stdout.columns = 50;
process.stdout.rows = 50;

getBtcPrices();
setInterval(getBtcPrices, 15 * 60 * 1000);

setTimeout(changeMiner, 1000);
setInterval(changeMiner, config.updateProfitMargins || 30000);

let retrySIGINT = false;

process.on('SIGINT', function() {
    running = false;
    killing = true;
    childAlgo = undefined;
    if (!childProcess.killed && !retrySIGINT) {
        writeLine('Quit mining...', 0, cursorPosAfterDetails + 35);
        killChild(function() {
            process.exit();
        }, true);
        retrySIGINT = true;
    } else {
        writeLine('Force exit...', 0, cursorPosAfterDetails + 35);
        process.exit();
    }
});

process.on('exit', () => {
    running = false;
    killing = true;
    childAlgo = undefined;
    killChild();
});
