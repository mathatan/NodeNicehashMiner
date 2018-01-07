# NodeNicehashMiner
Small JS script for running ccminer and ethminer with configuration and profitability calculation. (currently for nVidia cards only)

## Initialization

Please check `config.json` for example configuration. You'll have to benchmark algorithms by yourself and input the data into
the file. You also need to copy ccminer and ethminer to their respective folders. It should be noted that only tpruvot and
ethminer work currently.

## Requirements

You need a working version of Node.js v8+ and the miners but there are no other dependencies.

## Usage

Within your terminal start the script via `$ node nicehash.js miner` within the directory of the script if you have configured everything properly you should be good to go.

## TODO

This script is anything but finished. It's not really even on a beta yet, so use at your own discretion. Here's few things that still need doing:

 - Proper support for miners and parse of responses
 - Benchmarking within script, currently profitability calculation is limited to user inputed values
 - Detection of available GPU's and CPU's
 - Support for CPU mining, and also support for mining per individual GPU
 - Support for MiningpoolHub (somekind of future estimation for delayed transactions for auto trading would be ideal, but probably impossible)
 - Download and automatic updates for miners (where bins available and license allows it, this will likely never happen for MacOs, sorry...)
 - Configrations for different miner instances. E.g. excavator, sgminer, xmr-stak, etc.
 - Separation of concerns, split the script file into multiple smaller files
 - Plugin architecture for supporting e.g. Ifttt
 - Multi-instance support within network
 - Logs and profitability history
 - Profitability estimation by averagely found hashes (if possible)

## Feedback

If you have any suggestions or issues please let me know. This script is mainly for my own personal use in an MacOs platform. Also
the code is far from perfect and by default quite messy. If this thing picks up interest I might revise it, but for now it just works. (tm) :)

## Donations

The script is fully free to use without any limitations or additional fees but if you feel so inclined you can throw me
a small BTC donation at 3CC35VEKMd861aWWSgGqPyRurc4JXCTpsX

Cheers!
