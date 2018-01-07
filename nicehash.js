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
const algoMap = [];

for (const key in _algoKeys) {
    if (config.algorithms.hasOwnProperty(key)) {
        algoKeys[key] = _algoKeys[key];
    }
    if (_algoKeys.hasOwnProperty(key)) {
        algoMap[_algoKeys[key]] = key;
    }
}

const profitCalcMutliplier = 24 * 60 * 60 / 100000000000;

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
    algoJob,
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
    if (typeof deviceId !== 'undefined' && line.indexOf('GPU') !== -1 ) {
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
    } else if (typeof deviceId !== 'undefined'){
        const speed1 = deviceId,
            unit1 = deviceName,
            speed2 = speed,
            unit2 = unit;

        hashSpeed = '';
        hashSpeed = `${fgWhite}${speed2} ${unit2}${ttyReset} (${fgWhite}${speed1} ${unit1}${ttyReset})`;
    }

    if (hashSpeed) {
        writeLine(`\tCurrent speed: ${hashSpeed}`, 0, cursorPosAfterDetails + 3);
    } else {
        writeLine('\tCurrent speed: Not yet detected', 0, cursorPosAfterDetails + 3);
    }
};

let prevAccepted = 0, totalAccepted = 0;

const updateAccepted = function(algo, miner, line, accepted, _total, diff, speed, unit) {
    //, status
    let total;

    if (typeof line !== 'undefined') {
        if (parseInt(accepted) > prevAccepted) {
            lastHash = new Date();
            prevAccepted = parseInt(accepted);

            totalAccepted++;
            total = _total || totalAccepted;
        }
    }

    if (lastHash && prevAccepted === parseInt(accepted)) {
        if (typeof diff !== 'undefined') {
            lastHashString = `${currentAlgoName} - ${fgCyan}${lastHash.toLocaleTimeString()}: ${ttyReset}${accepted}/${total}: ${fgWhite}${speed} ${unit}${ttyReset} with ${getProfitString(
                currentAlgoPrice
            )}`;
        } else {
            lastHashString = `${currentAlgoName} - ${fgCyan}${lastHash.toLocaleTimeString()}: ${ttyReset}${accepted}/${total}${ttyReset} with ${getProfitString(
                currentAlgoPrice
            )}`;
        }
    }

    if (lastHashString) {
        writeLine(`\tLast accepted: ${lastHashString}`, 0, cursorPosAfterDetails + 4);
    } else {
        writeLine('\tLast accepted: None yet', 0, cursorPosAfterDetails + 4);
    }
};

const updateDifficulty = function(algo, miner, line, difficulty, difficulty2, difficulty3) {
    if (difficulty || difficulty3) {
        algoDifficulty = difficulty3 ? difficulty3 : difficulty + ' ' + difficulty2;
    }

    if (algoDifficulty) {
        writeLine(`\tDifficulty: ${fgYellow}${algoDifficulty || 'undefined'}`, 0, cursorPosAfterDetails + 5);
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

const httpFetch = function (url, cb) {
    https.get(url, resp => {
        let data = '';

        resp.on('data', chunk => {
            data = data + chunk;
        });

        resp.on('end', () => {
            let result;

            try {
                result = JSON.parse(data);
            } catch (e) {
                cb(resp.statusCode + ': ' + resp.statusMessage);
                return;
            }

            cb(undefined, result);
        }).on('error', err => {
            writeLine('Error: ' + err.message, 0, cursorPosAfterDetails + 8);
            cb(err);
        });
    });
}

let retryProfitCheckTo;

const switchAlgo = function _retry(algo, previous) {
    const retry = () => { _retry(algo, previous); };
    const algoMineTimeCheck = Date.now() - lastChange > (config.mineAtLeast || 3 * 60 * 1000);
    const force = algo.profit > previous.profit * 1.5;

    if (
        !force &&
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

    if (running && !killing && (algoMineTimeCheck || force)) {
        let priceSwitch = false;
        const difference = algo.profit - previous.profit;

        if (conversionRate !== 0) {
            priceSwitch = difference * conversionRate > (config.changeThreshold || 0.1);
        } else {
            priceSwitch = difference * 1000 > (config.changeThresholdBtc || 0.02);
        }
        // console.log('Run with', algo, (difference * 1000).toFixed(4));
        if ((childAlgo !== algo.algo && priceSwitch) || typeof childAlgo === 'undefined') {
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
                    startChild[algo.algo](algo.profit);
                    running = true;
                }, true);
            } else {
                lastChange = Date.now();
                startChild[algo.algo](algo.profit);
            }
        }
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
            retryProfitCheckTo = setTimeout(retry, left + 100);
        }
    }
};

const profitHistory = {};

const renderProfitData = function (err, profit) {
    if (err === 'in-progress') {
        return;
    } else if (err === 'nochange') {
        writeLine(
            'No change in profit data (' + new Date().toLocaleTimeString() + ')...',
            0,
            cursorPosAfterDetails + 7
        );
        return;
    } else if (typeof err !== 'undefined') {
        writeLine('Error while fetching profit data:', 0, cursorPosAfterDetails + 8);
        try {
            writeLine(JSON.stringify(err), 0, cursorPosAfterDetails + 9, true);
        } catch (e) {}
        return;
    }

    writeLine(`Mining in ${config.server} as ${config.wallet}.${config.miner}`, 0, 3);
    writeLine('Status for algorithms at ' + new Date().toLocaleTimeString() + ':', 0, 4, true);
    cursorPos = 5;

    const profitItems = {}, previousProfitItems = {};
    profit.map(profitItem => {
        profitHistory[profitItem.algo] = profitHistory[profitItem.algo] || [];
        const algoHistory = profitHistory[profitItem.algo];
        if (algoHistory.length === 0 || algoHistory[algoHistory.length - 1].profit !== profitItem.profit) {
            profitHistory[profitItem.algo].push(profitItem);
        }
    });

    profit.map(profitItem => {
        const history = profitHistory[profitItem.algo];
        const compared = (history.length < 2) ? (0) : (history[history.length - 1].profit - history[history.length - 2].profit);

        writeLine(
            `\t${profitItem.algo}${profitItem.algo.length < 8 ? '\t\t' : '\t'} ${getProfitString(profitItem.profit)
                } ${history[history.length - 1].time < (Date.now() - 10000) ? (ttyDim) : ('')}${compared >= 0
                            ? compared === 0 ? '- no change' : fgGreen + '^'
                    : fgRed + 'v'} ${compared !== 0 ? getProfitString(compared) : ''}${ttyReset}`,
            0,
            cursorPos
        );
        cursorPos++;
    });

    cursorPos++;

    cursorPosAfterDetails = cursorPos;

    const algo = profit[0],
        nextAlgo = profit[1];

    const curAlgo = (childAlgo) ? (profitHistory[childAlgo][profitHistory[childAlgo].length - 1]) : nextAlgo;
    const diff = algo.profit - ((curAlgo.algo === algo.algo) ? (nextAlgo.profit) : (curAlgo.profit));

    if (algo.algo !== childAlgo) {
        if (childAlgo) {
            writeLine(
                `${childAlgo} is making ${getProfitString(
                    curAlgo.profit
                )} and ${algo.algo} is more profitable by ${getProfitString(diff)}`,
                0,
                cursorPosAfterDetails
            );
        } else if (!first) {
            writeLine(`${algo.algo} is more profitable by ${getProfitString(diff)}`, 0, cursorPosAfterDetails);
        } else {
            writeLine(`${algo.algo} is most profitable by ${getProfitString(diff)}`, 0, cursorPosAfterDetails);
        }
    } else {
        if (childAlgo) {
            writeLine(
                `${childAlgo} is making ${getProfitString(
                    curAlgo.profit
                )} and is the most profitable by ${fgGreen}${getProfitString(diff)}`,
                0,
                cursorPosAfterDetails
            );
        } else {
            writeLine(`${algo.algo} is most profitable by ${getProfitString(diff)}`, 0, cursorPosAfterDetails);
        }
    }

    cursorPos++;

    first = false;

    updateValues();
    updateLog('');

    const ret = [];

    if (typeof previousProfits === 'undefined' || curAlgo.algo !== profit[0].algo) {
        // switchAlgo(algo, curAlgo);
        ret.push(algo);
        ret.push(curAlgo);
    }

    // cb(0, algo, profit[algo] - profit[childAlgo || nextAlgo], profit[algo]);

    const childHistory = childAlgo && profitHistory[childAlgo]
    if (typeof previousProfits === 'undefined' || childHistory && childHistory[childHistory.length - 1].time > (Date.now() - 10000)) {
        updateCurrentProfit(childHistory && childHistory[childHistory.length - 1].profit || algo.profit);
    }

    return ret;
}

let fetchingData = false;

const getProfitData = function(cb) {
    if (fetchingData) {
        cb('in-progress');
        return;
    }
    fetchingData = true;

    let topCount = 5, waiting = 0;

    const profit = [];

    const allDone = () => {
        profit.sort((a, b) => b.profit - a.profit);

        fetchingData = false;

        if (JSON.stringify(profit) === JSON.stringify(previousProfits)) {
            cb('nochange');
            return;
        }

        cb(undefined, profit);

        previousProfits = profit;
    };

    const hashprofit = function (algo, price) {
        return parseFloat(price) * config.algorithms[algo].multiplier * config.algorithms[algo].speed *
                 profitCalcMutliplier;
    }

    const _handleAlgo = function retry(profitItem) {
        const url = 'https://api.nicehash.com/api?method=orders.get&location=' + config.location + '&algo=' + profitItem.id;

        httpFetch(url, (err, results) => {
            if (err) {
                setTimeout(() => { retry(profitItem); }, 5000);
                return;
            }

            waiting--;

            let count = 0, avgSum = 0, avg, unlimited = 0, most;

            results.result.orders
                .sort((a, b) => parseFloat(b.workers) - parseFloat(a.workers))
                .map(order => {
                    if (order.alive && order.workers > 0) {
                        avgSum += parseFloat(order.limit_speed) * parseFloat(order.price);
                        count += parseFloat(order.limit_speed);

                        if (!unlimited && parseFloat(order.limit_speed) === 0) {
                            unlimited = order.price;
                        }

                        if (!most && parseFloat(order.limit_speed) > 0 && parseFloat(order.limit_speed) > 1.2 * parseFloat(order.accepted_speed)) {
                            most = parseFloat(order.price);
                        }
                    }
                });

            most = (most) ? hashprofit(profitItem.algo, most) : (profitItem.protoProfit);
            unlimited = hashprofit(profitItem.algo, unlimited);

            avg = hashprofit(profitItem.algo, avgSum / count);

            profitItem.balancedProfit = (unlimited > Math.max(most, avg, profitItem.protoProfit) ? unlimited : Math.min(most, profitItem.protoProfit, avg));

            profitItem.profit = (profitItem.balancedProfit + profitItem.protoProfit) / 2 ;

            profitItem.time = Date.now();

            profit.push(profitItem);

            if (waiting === 0) {
                allDone();
            }
        });
    };

    const handleAlgo = (algo, count) => {
        setTimeout(() => {
            _handleAlgo(algo);
        }, (count + 1) * 150);
    }

    httpFetch('https://api.nicehash.com/api?method=stats.global.current&location=' + config.location, (err, results) => {
        if (err) {
            cb(err);
            return;
        }

        const keys = Object.keys(algoKeys);

        const profit = results.result.stats.map(algo => {

            if (keys.indexOf(algoMap[algo.algo]) === -1) {
                return;
            }

            key = algoMap[algo.algo];

            return {
                protoProfit: hashprofit(key, algo.price),
                algo: key,
                id: algo.algo,
                speed: parseFloat(algo.speed)
            }
        }).filter((item) => typeof item !== 'undefined');
        
        profit.sort((a, b) => b.protoProfit - a.protoProfit);

        for (let i = 0; i < topCount; i++) {
            waiting++;
            handleAlgo(profit[i], i);
        }
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
            // writeLine('difficulty detected: ' + JSON.stringify(values), 0, 0);
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
};

const followChild = function(algo) {
    childProcess.stdout.on('data', data => {
        updateLog(data);

        matchLines(algo, data);
    });

    childProcess.stderr.on('data', data => {
        updateLog(data);

        matchLines(algo, data);
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
            totalAccepted = 0;

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
    if (childProcess && !childProcess.killed && algoRunning[prevChild]) {
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

const getBtcPrices = function retry() {
    httpFetch('https://blockchain.info/ticker', (err, result) => {
        if (!err) {
            conversionRate = result[config.currency || 'EUR']['15m'];
            currencySymbol = result[config.currency || 'EUR'].symbol;
        } else {
            writeLine('Error: ' + e, 0, cursorPosAfterDetails + 8);
            setTimeout(retry, 30000);
        }
    });
};

process.stdout.columns = 50;
process.stdout.rows = 50;

getBtcPrices();
setInterval(getBtcPrices, 15 * 60 * 1000);

const minerLoop = function () {
    getProfitData((err, profits) => {
        if (err) {
            return;
        }

        var change = renderProfitData(err, profits);
        if (change.length > 0) {
            switchAlgo(...change);
        }
    });
};

setTimeout(minerLoop, 1000);
setInterval(minerLoop, config.updateProfitMargins || 30000);

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
