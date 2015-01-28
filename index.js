var fs = require('fs');
var chalk = require('chalk');
var path = require('path');
var SourceMapConsumer = require('source-map').SourceMapConsumer;

var VsErrorReporter = function (formatError, logger) {

  var log = logger.create('reporter.vserror');

  function logError(message) {
    log.error(chalk.red(message));
  }

  function logWarning(message) {
    log.warn(message);
  }

  function logSucces(message) {
    log.info(chalk.green(message));
  }

  function logDebug(message) {
    //console.log(message);
    log.debug(message);
  }

  function logVsErrorMessage(file, line, col, error) {
    var message = file;
    if (line) {
      message += '(' + line;
      col && (message += ',' + col);
      message += ')';
    }
    message += ': error: ' + error;
    console.error(chalk.red('\n' + message));
  }

  function readFile(filePath, done) {
    logDebug(filePath + ": reading file.");
    // Make Sync? because onSpecComplete has no done callback
    fs.exists(filePath, function(exists) {
      if (!exists) {
        logDebug(filePath + ": file not found.");
        done(null);
      } else {
        // Make Sync? because onSpecComplete has no done callback
        fs.readFile(filePath, function(err, data) {
          if (err){
            logDebug(filePath + ": error reading file.");
            throw err;
          }
          done(data);
        });
      }
    });
  }

  function inlineMap(inlineData){
    var data;
    var b64Match = inlineData.match(/^data:.+\/(.+);base64,(.*)$/);
    if (b64Match !== null && b64Match.length == 3) {
      // base64-encoded JSON string
      var buffer = new Buffer(b64Match[2], 'base64');
      return JSON.parse(buffer.toString());
    } else {
      // straight-up URL-encoded JSON string
      return JSON.parse(decodeURIComponent(inlineData.slice('data:application/json'.length)));
    }
  }

  function getFileInfo(file, line, col, done) {

    readFile(file, function (data) {
      if (data) {

        // Read lines
        var lines = data.toString().split('\n');

        // If no column, find first char on line
        if (col === 0) {
          var errorLine = lines[line-1];
          logDebug("error line: " + errorLine)
          if (errorLine) {
            var firstCharMatch = errorLine.match(/(\w)/);
            if (firstCharMatch) {
              col = firstCharMatch.index + 1;
              logDebug("detectd first char at position: " + col)
            }
          }
        }

        // Checking if lastLine has sourceMappingUrl
        var eol = require('os').EOL;
        var lastLine = lines.pop();
        var match = lastLine.match(/\/\/#\s*sourceMappingURL=(.+)$/);
        var mapUrl = match && match[1];

        if (!mapUrl) {
          logDebug(file + ": no inline sourcemap found. Not yet supported");
          //readFile(file.path + ".map", function() {});
          done();
        } else if (/^data:application\/json/.test(mapUrl)) {
          logDebug(file + ": inline sourcemap found.");
          var sourceMap = inlineMap(mapUrl);
          done(sourceMap, col);

        } else {
          logDebug(file + ": reference to external sourcemap found: " + mapUrl + ". Not yet supported");
          //readFile(path.resolve(path.dirname(file), mapUrl), function() {});
          done();
        }
      }
    });

  }

  var skippedCount = 0;
  var failCount = 0;
  var successCount = 0;

  this.onSpecComplete = function (browser, result) {

    // Only log Errors
    if (result.skipped) {
      skippedCount++;
    } else if (result.success) {
      successCount++;
    } else {
      failCount++;

      result.log.forEach(function(log) {

        // http to file
        var logWithPath = formatError(log, '');

        // Try to extract filename and line
        var regEx = /.*\s(.:.*?):([0-9]*?):([0-9]?)/g;  // Visual Studio -> assuming windows path
        var match = regEx.exec(logWithPath);
        if (match) {

          // Get parts
          var file = path.normalize(match[1]);
          var line = parseInt(match[2], 10);
          var col = parseInt(match[3], 10);
          var error = logWithPath;
          if (error[error.length-1] === '\n') {
            error = error.substring(0, error.length-2);
          }
          logDebug("parse error: file: " + file + ", line: " + line + ", col: " + col);

          // Check if sourcemap are available in the file
          getFileInfo(file, line, col, function(sourceMap, col) {

            if (sourceMap) {
              // Try to get original location
              var smc = new SourceMapConsumer(sourceMap);
              var original = smc.originalPositionFor({line: line, column: col});
              logDebug("original location: " + JSON.stringify(original));

              /* Visual Studio friendly log message */
              if (original.source) {
                logVsErrorMessage(path.normalize(original.source), original.line, original.column + 1, error);
              } else {
                logVsErrorMessage(file, line, col, error);
              }

            } else {
              /* Visual Studio friendly log message */
              logVsErrorMessage(file, line, col, error);
            }
          });

        }
      });
    }
  };

  this.onRunComplete = function (browsers, results) {
    if (failCount > 0) {
      logError(failCount + ' of ' + (failCount + successCount) + ' tests failed.');
    } else if (skippedCount > 0 && successCount > 0) {
      logWarning(successCount + ' tests executed succesful, ' + skippedCount + ' skipped.');
    } else if (successCount > 0) {
      logSucces('All ' + successCount + ' tests completed succesful.');
    } else {
      logWarning('No tests executed.');
    }
  };
};

// inject karma runner baseReporter and config
VsErrorReporter.$inject = ['formatError', 'logger'];

// Public module
module.exports = {
    'reporter:vserror': ['type', VsErrorReporter]
};
