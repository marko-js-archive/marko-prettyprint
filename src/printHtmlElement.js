"use strict";

const unescapePlaceholdersInStringExpression = require("./util/unescapePlaceholdersInStringExpression");
const hasUnenclosedWhitespace = require("./util/hasUnenclosedWhitespace");
const getBodyText = require("./util/getBodyText");
const hasLineBreaks = require("./util/hasLineBreaks");
const printers = require("./printers");
const Writer = require("./util/Writer");
const formattingTags = require("./formatting-tags");

const formatJS = require("./util/formatJS");
const formatStyles = require('./util/formatStyles');

const codeTags = {
  class: {
    type: "js",
    prettyprint: true
  },
  import: {
    type: "js",
    prettyprint: false
  },
  static: {
    type: "js",
    prettyprint: true
  },
  style: {
    type: "style",
    prettyprint: true
  }
};

function isComponentStyleTag(node) {
  var attrs = node.getAttributes();
  var attrCount = attrs.length;
  if (!attrCount) {
    return false;
  }

  var lastAttr = attrs[attrCount - 1];
  return /\s*\{/.test(lastAttr.name);
}

function handleCodeTag(node, printContext, writer) {
  var tagName = node.tagName;

  let codeTagInfo = codeTags[tagName];

  if (!codeTagInfo) {
    return false;
  }

  if (tagName === "style" && !isComponentStyleTag(node)) {
    return false;
  }

  let outputCode = node.tagString;

  if (codeTagInfo.prettyprint === true) {
    if (codeTagInfo.type === "js") {
      if (tagName === "static") {
        outputCode = outputCode.replace(/^\s*static\s*/, "");
      }
      outputCode = formatJS(outputCode, printContext);

      if (tagName === "static") {
        outputCode = "static " + outputCode;
      }
    } else if (codeTagInfo.type === "style") {
      outputCode = formatStyles(outputCode, printContext);
    }
  }

  writer.write(outputCode);

  return true;
}

module.exports = function printHtmlElement(node, printContext, writer) {
  if (node.hasAttribute("marko-preserve-whitespace")) {
    printContext = printContext.startPreservingWhitespace();
  } else if (node.tagDef && node.tagDef.preserveWhitespace === true) {
    printContext = printContext.startPreservingWhitespace();
  }

  if (printContext.depth === 0 && handleCodeTag(node, printContext, writer)) {
    return;
  }

  var isDynamicTagName = node.tagName.startsWith("$");
  var preserveBodyWhitespace = printContext.preserveWhitespace === true;
  var maxLen = printContext.maxLen;

  if (preserveBodyWhitespace || isDynamicTagName) {
    // We can only reliably preserve whitespace in HTML mode so we force the HTML
    // syntax if we detect that whitespace preserval is enabled
    printContext = printContext.switchToHtmlSyntax();
  }

  if (!printContext.isConciseSyntax) {
    writer.write("<");
  }

  writer.write(node.tagName);

  if (node.rawShorthandId) {
    writer.write("#" + node.rawShorthandId);
  }

  if (node.rawShorthandClassNames) {
    node.rawShorthandClassNames.forEach(className => {
      writer.write("." + className);
    });
  }

  if (node.argument != null) {
    writer.write("(" + node.argument + ")");
  }

  var attrsWriter = new Writer(writer.col);
  attrsWriter.col++; // Allow for space after tag name;

  var attrs = node.getAttributes();

  var attrStringsArray = [];

  var hasBody = node.body && node.body.length;

  let bodyText = getBodyText(node);
  if (bodyText && printContext.preserveWhitespace !== true) {
    bodyText = bodyText.trim();
  }

  if (bodyText != null && bodyText.length === 0) {
    bodyText = null;
    hasBody = false;
  }

  // We will make one pass to generate all of the strings for each attribute. We will then
  // append them to the output while avoiding putting too many attributes on one line.
  attrs.forEach((attr, i) => {
    var attrStr = "";

    if (attr.name) {
      attrStr += attr.name;
      var attrValue = attr.value;
      if (attrValue) {
        if (hasUnenclosedWhitespace(attrValue)) {
          attrStr +=
            "=(" + unescapePlaceholdersInStringExpression(attrValue.toString()) + ")";
        } else {
          attrStr +=
            "=" + unescapePlaceholdersInStringExpression(attrValue.toString());
        }
      } else if (attr.argument != null) {
        attrStr += "(" + attr.argument + ")";
      }
    } else if (attr.spread) {
      attrStr += "..." + attr.value;
    } else {
      attrStr += "${" + attr.value + "}";
    }

    attrStringsArray.push(attrStr);
  });

  if (attrStringsArray.length) {
    // We have attributes
    // Let's see if all of the attributes will fit on the same line
    if (printContext.isHtmlSyntax) {
      var oneLineAttrs = attrStringsArray.join(" ");
      var fitsOneLine = attrStringsArray.length <= 1 || writer.col + oneLineAttrs.length < maxLen;
      var attrIndentation = printContext.eol + printContext.currentIndentString + printContext.indentString;
      writer.write(fitsOneLine ?
        " " + oneLineAttrs :
        attrIndentation + attrStringsArray.join(attrIndentation)
      );

      writer.write(hasBody ? ">" : "/>");
    } else {
      var useCommas = node.tagName === "var";

      var attrsString;

      if (useCommas) {
        attrsString = " " + attrStringsArray.join(", ") + ";";
      } else {
        attrsString = " " + attrStringsArray.join(" ");
      }

      if (writer.col + attrsString.length < maxLen) {
        writer.write(attrsString);
      } else {
        if (useCommas) {
          writer.write(" ");
          var lastIndex = attrStringsArray.length - 1;

          attrStringsArray.forEach((attrString, i) => {
            if (i !== 0) {
              writer.write(printContext.currentIndentString);
              writer.write(printContext.indentString);
            }

            if (i === lastIndex) {
              writer.write(attrString + ";" + printContext.eol);
            } else {
              writer.write(attrString + "," + printContext.eol);
            }
          });
        } else {
          writer.write(" [" + printContext.eol);
          attrStringsArray.forEach((attrString, i) => {
            writer.write(printContext.currentIndentString);
            writer.write(printContext.indentString);
            writer.write(printContext.indentString);
            writer.write(attrString + printContext.eol);
          });

          writer.write(printContext.currentIndentString);
          writer.write(printContext.indentString);
          writer.write("]");
        }
      }
    }
  } else {
    if (printContext.isHtmlSyntax) {
      if (hasBody) {
        writer.write(">");
      } else {
        writer.write("/>");
        return;
      }
    }
  }

  if (!hasBody) {
    return;
  }

  var endTag = printContext.isHtmlSyntax ? "</" + node.tagName + ">" : "";

  if (bodyText && !hasLineBreaks(bodyText)) {
    let endCol = writer.col + bodyText.length + endTag.length;

    if (endCol < maxLen) {
      if (printContext.isConciseSyntax) {
        writer.write(" -- " + bodyText);
      } else {
        writer.write(bodyText + "</" + node.tagName + ">");
      }
      return;
    }
  }

  if (!preserveBodyWhitespace) {
    writer.write(printContext.eol);
  }

  var nestedPrintContext = printContext.beginNested();

  if (printContext.isHtmlSyntax && formattingTags[node.tagName]) {
    let nestedWriter = new Writer(writer.col);
    printers.printNodes(node.body.items, nestedPrintContext, nestedWriter);
    let trimmedOutput = nestedWriter.getOutput();
    if (preserveBodyWhitespace !== true) {
      trimmedOutput = nestedWriter.getOutput().trim();
    }

    if (hasLineBreaks(trimmedOutput)) {
      if (
        writer
          .getOutput()
          .endsWith(printContext.eol + printContext.indentString) === false
      ) {
        writer.write(printContext.indentString);
      }

      writer.write(nestedWriter.getOutput());
      writer.write(printContext.currentIndentString);
      writer.write(endTag);
    } else {
      if (preserveBodyWhitespace !== true) {
        writer.rtrim();
      }

      writer.write(trimmedOutput);
      writer.write(endTag);
    }
  } else {
    printers.printNodes(node.body.items, nestedPrintContext, writer);

    if (printContext.isHtmlSyntax) {
      if (!preserveBodyWhitespace) {
        writer.write(printContext.currentIndentString);
      }

      writer.write(endTag);
    }
  }
};
