const format = require("prettier").format;

module.exports = function(code, printContext) {
    let parser;

    const preprocessor = code.slice(6, 10);
    if (preprocessor === 'scss') {
        parser = 'scss';
    } else if (preprocessor === 'less') {
        parser = 'less';
    } else {
        parser = 'css';
    }

    const config = {
        useTabs: printContext.indentString[0] === '\t',
        tabWidth: printContext.indentString.length,
        parser
    };

    return format(code, config);
};
