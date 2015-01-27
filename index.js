var fs = require('fs');
var chalk = require('chalk');
var path = require('path');

var VsErrorReporter = function (formatError) {

  function logError(message) {
    console.error(chalk.red('\n' + message));
  }

  function logWarning(message) {
    console.warn(chalk.magenta('\n' + message));
  }

  function logSucces(message) {
    console.info(chalk.green('\n' + message));
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

        var logWithPath = formatError(log, '');

        // Try to extract filename
        var regEx = /.*\w+\s(.*):(.*)/g;
        var match = regEx.exec(logWithPath);
        if (match) {

          var file = path.normalize(match[1]);
          var line = parseInt(match[2], 10);
          var error = logWithPath;
          if (error[error.length-1] === '\n') {
            error = error.substring(0, error.length-2);
          }

          // Log if file
          if (fs.existsSync(file)) {
            var message = file;
            if (line > 0) { message += '(' + line + ')';}
            message += ': error: ' + error;
            logError(message);
          } else {
            logError(logWithPath);
          }
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
VsErrorReporter.$inject = ['formatError'];

// Public module
module.exports = {
    'reporter:vserror': ['type', VsErrorReporter]
};
