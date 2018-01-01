const https = require('https');
const config = require('./config.json');

let childProcess;
let childAlgo;
let prevChild;

let running = true;
let killing = false;
let lastChange = 0;

let currentPrice = 0,
    currencySymbol = 'e';

let first = true;
let cursorPos = 0,
    cursorPosAfterDetails;

const algoKeys = {};
const _algoKeys = require('./nicehashAlgos.json');

for (const key in _algoKeys) {
    if (config.hasOwnProperty(key)) {
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
writeLine(ttyDim + '     If you like it, please donate some mBTC for the trouble. :)', 0, 1);
writeLine(
    ttyDim + '      BTC Donation address: ' + ttyReset + ttyUnderscore + '3CC35VEKMd861aWWSgGqPyRurc4JXCTpsX',
    0,
    2
);

let _currentAlgoStr = '';
const currentlyRunning = function(str) {
    _currentAlgoStr = str || _currentAlgoStr;

    writeLine(_currentAlgoStr, 0, cursorPosAfterDetails + 1);
};

let hashSpeed,
    algoDifficulty,
    lastHash = new Date();

const updateSpeed = function(speed, difficulty) {
    hashSpeed = speed || hashSpeed;
    algoDifficulty = difficulty || algoDifficulty;
    if (speed) {
        lastHash = new Date();
    }

    if (hashSpeed) {
        writeLine(
            `\tCurrent speed: ${fgWhite}${hashSpeed}${ttyReset}\n\tDifficulty: ${fgYellow}${algoDifficulty ||
                'undefined'}${ttyReset}\n\tLast accepted share: ${fgCyan}${lastHash
                ? lastHash.toLocaleTimeString()
                : ''}`,
            0,
            cursorPosAfterDetails + 3
        );
    }
};

let log = '';
const updateLog = function(str) {
    const joinedStr = log + String(str);
    const logLines = joinedStr.split('\n');

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

const algoRunning = {};
let previousProfits;

const getProfitData = function(cb) {
    https
        .get('https://api.nicehash.com/api?method=stats.global.current&location=0', resp => {
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
                    cb(e);
                    return;
                }

                const multiplier = 24 * 60 * 60 / 100000000000;

                //console.log(values.result.stats);

                const profit = {};
                const algomap = {};

                Object.keys(algoKeys).map(key => {
                    profit[key] =
                        config[key].speed * config[key].multiplier * parseFloat(items[key].price, 10) * multiplier;

                    algomap[profit[key]] = key;
                });

                const keys = Object.keys(algomap).sort(function(a, b) {
                    return parseFloat(b) - parseFloat(a);
                });

                writeLine('Status for algorithms:', 0, 4, true);
                cursorPos = 5;

                keys.map(key => {
                    const algo = algomap[key];
                    const compared = previousProfits ? previousProfits[algo] - profit[algo] : 0;

                    writeLine(
                        `\t${algo}${algo.length < 8 ? '\t\t' : '\t'} profit ${(currentPrice * profit[algo]).toFixed(
                            2
                        )} ${currencySymbol}/day (${(1000 * profit[algo]).toFixed(4)}mBTC/day) ${compared > 0
                            ? fgGreen + 'up by'
                            : fgRed + 'down by'} ${compared * currentPrice} ${currencySymbol} (${(1000 * compared
                        ).toFixed(4)} mBTC)${ttyReset}`,
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
                            `${childAlgo} is making ${(profit[childAlgo] * currentPrice).toFixed(
                                2
                            )} ${currencySymbol}/day (${(profit[childAlgo] * 1000).toFixed(
                                4
                            )}mBTC/day) and ${algo} is more profitable by ${fgRed}${(currentPrice * diff).toFixed(2) +
                                currencySymbol}/day (${(1000 * diff).toFixed(4)}mBTC/day)`,
                            0,
                            cursorPosAfterDetails
                        );
                    } else if (!first) {
                        writeLine(
                            algo +
                                ' is more profitable by ' +
                                (currentPrice * diff).toFixed(2) +
                                currencySymbol +
                                '/day (' +
                                (1000 * diff).toFixed(4) +
                                'mBTC/day)',
                            0,
                            cursorPosAfterDetails
                        );
                    } else {
                        writeLine(
                            `${algo} is most profitable by ${(currentPrice * diff).toFixed(
                                2
                            )} ${currencySymbol}/day (${(1000 * diff).toFixed(4)}mBTC/day)`,
                            0,
                            cursorPosAfterDetails
                        );
                    }
                } else {
                    const diff = profit[algo] - profit[nextAlgo];

                    if (childAlgo) {
                        writeLine(
                            `${childAlgo} is making ${(profit[childAlgo] * currentPrice).toFixed(
                                2
                            )} ${currencySymbol}/day (${(profit[childAlgo] * 1000).toFixed(
                                4
                            )}mBTC/day) and is the most profitable by ${fgGreen}${(currentPrice * diff).toFixed(2) +
                                currencySymbol}/day (${(1000 * diff).toFixed(4)}mBTC/day)`,
                            0,
                            cursorPosAfterDetails
                        );
                    } else {
                        writeLine(
                            algo +
                                ' is most profitable by ' +
                                (currentPrice * diff).toFixed(2) +
                                currencySymbol +
                                '/day (' +
                                (1000 * diff).toFixed(4) +
                                'mBTC/day)',
                            0,
                            cursorPosAfterDetails
                        );
                    }
                }

                writeLine('\n');
                cursorPos++;

                first = false;
                previousProfits = profit;

                currentlyRunning();
                updateSpeed();
                updateLog('');

                cb(0, algo, profit[algo] - profit[childAlgo || nextAlgo], profit[algo]);
            });
        })
        .on('error', err => {
            writeLine('Error: ' + err.message);
            cb(err);
        });
};

const { spawn } = require('child_process');

const startChild = {};

const getParams = function(conf) {
    switch (conf.miner) {
        case 'ccminer':
            return [
                'ccminer/ccminer',
                [
                    '--retries=0',
                    '--intensity=' + conf.intensity,
                    '--cpu-priority=5',
                    '--algo=' + conf.algo,
                    '-o',
                    'stratum+tcp://' + conf.server + '.eu.nicehash.com:' + conf.port,
                    '-u',
                    config.wallet + '.' + config.miner,
                    '-p',
                    'x'
                ]
            ];
        case 'ethminer':
            return [
                'ethminer/ethminer',
                [
                    '-U',
                    '-SP',
                    '2',
                    '-S',
                    conf.server + '.eu.nicehash.com:' + conf.port,
                    '-O',
                    config.wallet + '.' + config.miner
                ]
            ];
        case 'nheqminer':
            return [
                'eqminer/nheqminer',
                [
                    '-l',
                    conf.server + '.eu.nicehash.com:' + conf.port,
                    '-u',
                    config.wallet + '.' + config.miner,
                    '-cd',
                    '0',
                    '-cb',
                    '32',
                    '-ct',
                    '256'
                ]
            ];
        default:
            return [];
    }
};

const followChild = function(algo) {
    childProcess.stdout.on('data', data => {
        updateLog(data);
        // console.log(`stdout: ${data}`);
        if (algo === 'DaggerHashimoto') {
            return;
        }

        const lines = String(data).split('\n');

        lines.map(line => {
            if (line.indexOf('accepted') !== -1) {
                updateSpeed(
                    line
                        .split('), ')[1]
                        .split('yes')[0]
                        .trim()
                );
            } else if (line.indexOf('Stratum difficulty') !== -1) {
                updateSpeed(undefined, line.split('Stratum difficulty set to ')[1].trim());
            }
        });
    });

    childProcess.stderr.on('data', data => {
        updateLog(data);
        // console.log(`stdout: ${data}`);
        const lines = String(data).split('\n');

        lines.map(line => {
            switch (algo) {
                case 'DaggerHashimoto':
                    if (line.indexOf('Speed') !== -1) {
                        updateSpeed(
                            line
                                .split('Speed ')[1]
                                .split('gpu')[0]
                                .trim()
                        );
                    } else if (line.indexOf('Stratum difficulty') !== -1) {
                        updateSpeed(undefined, line.split('Stratum difficulty set to ')[1].trim());
                    }
                    break;
                default:
                    writeLine('\n' + line);
                    break;
            }
        });
    });

    childProcess.on('close', (code, signal) => {
        if (signal !== 'SIGINT' && signal !== 'SIGSEGV' && running) {
            writeLine(
                `Child process terminated due to receipt of signal ${signal}; restart...`,
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
    startChild[key] = function(price) {
        if (!algoRunning[key]) {
            _currentAlgoStr = '';
            algoDifficulty = '';
            hashSpeed = '';
            log = '';

            const now = new Date();

            currentlyRunning(
                `\tStarted ${key}: ${fgCyan}${now.toLocaleTimeString()}${ttyReset}\n\tProfit: ${fgGreen}${(price *
                    currentPrice
                ).toFixed(2)}${currencySymbol}/day (${(price * 1000).toFixed(4)}mBTC/day)`,
                0
            );
            childAlgo = key;
            prevChild = key;
            const params = getParams(config[key]);

            childProcess = spawn(params[0], params[1]);
            algoRunning[key] = true;
            followChild(key);
        } else {
            writeLine(`\nAlgorithm ${key} already running, skip run.`, 0, cursorPosAfterDetails + 1);
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

    if (algoMineTimeCheck && Date.now() - lastHash.getTime() > 20000) {
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

                if (currentPrice !== 0) {
                    priceSwitch = difference * currentPrice > (config.changeThreshold || 0.1);
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
            } else {
                writeLine('Error while fetching profit data:', 0, cursorPosAfterDetails + 8);
                try {
                    writeLine(JSON.stringify(err), 0, cursorPosAfterDetails + 8, true);
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

                    currentPrice = values[config.currency || 'EUR']['15m'];
                    currencySymbol = values[config.currency || 'EUR'].symbol;
                })
                .on('error', err => {
                    writeLine('Error: ' + err.message);
                    setTimeout(retry, 30000);
                });
        });
    } catch (e) {
        writeLine('Error: ' + e);
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
