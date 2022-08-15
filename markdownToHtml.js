function indentation(n = 1) {
    const unitIndentation = (' ').repeat(2);
    return unitIndentation.repeat(n);
}  

function toHtmlLink(markdown, text, link, titleIdentificaiton, titleCapture) {
    const htmlTitle = titleCapture !== undefined ? `title="${titleCapture}"` : '';
    const htmlText = text || link;
    const htmlLink = `href="${link}"`;

    return `<a ${htmlTitle} ${htmlLink}>${htmlText}</a>`;
}

function toTypograph(symbol) {
    return {
        c: '©',
        r: '®',
        tm: '™',
        p: '§'
    }[symbol];
}

function formatInlineElements(html) {
    return html
        .replace(/(\*|_){2}(.+?)(\*|_){2}/g, '<strong>$2</strong>')                     // bold 
        .replace(/(\*|_)(\S.*?)(\*|_)/g, '<i>$2</i>')                                   // italic
        .replace(/`(.+?)`/g, '<code>$1</code>')                                         // code
        .replace(/\[(.*?)\]\((https?.+?\.\S+)(\s*?"(.+?)")?\s*?\)/g, toHtmlLink)        // link text
        .replace(/(?<!=")(https?.+?\.\S+)/, '<a href=$1>$1</a>')                        // autoconverted link
        .replace(/~~(.+?)~~/, '<s>$1</s>')                                              // strikethrough
        .replace(/([\!\?\.]{3,})/g, endPunctuation => endPunctuation.substr(0, 3))      // end punctuation limit
        .replace(/\(((c)|(r)|(tm)|(p))\)/gi, (match, capture) => toTypograph(capture.toLowerCase()))   // to typograph

        // Plugins
        .replace(/\^(.+?)\^/g, '<sup>$1</sup>')
        .replace(/~(.+?)~/g, '<sub>$1</sub>')
        .replace(/\+\+(.+?)\+\+/g, '<ins>$1</ins>')
        .replace(/==(.+?)==/g, '<span class="marked">$1</span>');

}

function classnames(blockElement) {
    return blockElement.classNames !== undefined
        ? ` class="${blockElement.classNames.join(' ')}"`
        : '';
}

function deleteElementWithReference(match) {
    console.log(match);

    const lines = match[0].split('\n');
    const imageDeclaration = lines[0];
    const imageReference = lines.slice(-1)[0];
    const forDeletionRegex = `(${imageDeclaration}|${imageReference})`.replace(/([\[\]])/g, '\\$1');

    return new RegExp(forDeletionRegex, 'g');
}

function toNestedGroup(blockElement, group, indentationFunc) {
    const tag = blockElement.type;
    
    // ORDERED LISTS ONLY
    const firstItemNumber = group.split('\n')[0].match(/^\d+/);
    const start = ![null, "1"].includes(firstItemNumber) ? `start="${firstItemNumber}"` : '';   

    const htmlGroup = [];
    let currentDepth = 0;

    const nestedGroup = group
        .split('\n')
        .filter(item => item)
        .map(item => { 
            const content = item.match(blockElement.regex)[1];
            const indentation = indentationFunc(item)

            return { content: content, depth: indentation };
        })
        // try reducing this instead
        .forEach(item => {
            if (item.depth > currentDepth) {
                htmlGroup.push(indentation(currentDepth) + `<${tag}>`)
                currentDepth++;
            }

            while (item.depth < currentDepth) {
                currentDepth--;
                htmlGroup.push(indentation(currentDepth) + `</${tag}>`);
            }

            const htmlLine = blockElement.hasOwnProperty('subType') 
                ? `<${blockElement.subType}>${item.content}</${blockElement.subType}>`
                : `<p>${item.content}</p>`;

            htmlGroup.push(indentation(currentDepth) + htmlLine);
        })

    // repeated code. Find a way to refactor
    // confirm that lists required similar code
    while (currentDepth > 0) {
        currentDepth--;
        htmlGroup.push(indentation(currentDepth) + `</${tag}>`);
    }

    return htmlGroup.join('\n');
}

function toNestedList(blockElement, group) {
    return toNestedGroup(blockElement, group, 
        item => {
            const indentation = item.match(/^\s*/)[0].length + 2;
            return Math.floor(indentation / 2);
        });
}

function toNestedBlockquotes(blockElement, group) {
    return toNestedGroup(blockElement, group, 
        item => item.match(/^[>\s]+/)[0].replace(/\s/g, '').length);
}

function toTable(blockElement, group) {
    const rows = group.split('\n');
    const tableDivision = rows.splice(1, 1)[0];

    const isRightAligned = tableDivision
        .split('|')
        .slice(1, -1)
        .map(c => c.slice(-1) === ':');
    
    // refactor. Can we use recursion?
    const htmlRows = rows
        .filter(item => item)
        .map((row, rowIndex) => {
            const tag = rowIndex === 0 ? 'th' : 'td';

            const htmlRow = row.split('|')
                .slice(1, -1)
                .map((column, columnIndex) => {
                    const textAlignment = isRightAligned[columnIndex] ? ' style="text-align:right"' : '';
                    return `${indentation(2)}<${tag}${textAlignment}>${column.trim()}</${tag}>`;
                })
                .join('\n');
            
            return `${indentation()}<tr>\n${htmlRow}\n${indentation()}</tr>`;
        })
        .join('\n');

    return `<table>\n${htmlRows}\n</table>`;
}

function toMultiLineHtml(blockElement, group, toHtml) {
    const items = group
        .split('\n')
        .filter(item => item)
        .map((item, i) => {
            // indexed at 1 due to the brackets used in the regex
            // what if the appropriate content is not at index 1?
            // why should other code need to know that the first index is being used?
            // refactor accordingly
            const strippedMarkdown = item.match(blockElement.regex)[1];
            return toHtml(strippedMarkdown, i, group);
        })
        .join('\n');

    return `<${blockElement.type}${classnames(blockElement)}>\n${items}\n</${blockElement.type}>`;
}

function multilineRegex(lineRegex, multiLineRegex = lineRegex => `^(${lineRegex.source}\\n?)+`) {
    return new RegExp(multiLineRegex(lineRegex));
}

const blockElements = [
    // single line
    {
        type: 'h',
        regex: /^(#{1,6})(.+)/,
        get groupRegex() { return this.regex; },
        toHtml: match => 
            `<h${match[1].length}>${match[2].trim()}</h${match[1].length}>`
    },
    {
        type:'horizontal-rule',
        regex: /^[-_\*]{3,}/,
        get groupRegex() { return this.regex; },
        toHtml: match => `<div class="horizontal-rule"></div>`
    },
    {
        type: 'img',
        regex: /^!\[(.*?)\]\((.+?)\)/,
        get groupRegex() { return this.regex; },
        toHtml: match => `<img src="${match[2]}" alt="${match[1]}" />`
    },
    {
        type: 'img-with-reference',
        regex: /.*?/,
        groupRegex: /^!\[(.+?)\]\[(.+?)\](\n|.)+\[\2\]:\s*(https?.+?\.\S+)(\s*?"(.+?)")?/,  // [alt text][id](\n...)[id]:(href "title")
        deletionRegex: match => deleteElementWithReference(match),
        toHtml: match => 
            `<img title="${match[6]}" src="${match[4]}" alt="${match[1]}" />`
    },
    {
        type: 'footnote',
        regex: /.+?/,
        groupRegex: /(.+?)(\[\^(.+?)\])(.+?)(\n|.)+\2:\s*?(.+?)/, // ...[^ref](\n...)[^ref]...
        // deletionRegex: match => deleteElementWithReference(match),
        counter: 1,
        get toHtml() {
            return match => 
                `<code>${match[1]}[${this.counter}]${match[4]}</code>` + '\n' +
                `<code>${this.counter}. ${match[5]}</code>`;
        } 
    },

    // multi line
    {
        type: 'ul',
        subType: 'li',
        regex: /\s*[-\*\+]\s(.*)/,
        get groupRegex() { return multilineRegex(this.regex); },
        get toHtml() {  return match => toNestedList(this, match[0]); }  
    },
    {
        type: 'ol',
        subType: 'li',
        regex:/\s*\d+\.\s(.*)/,
        get groupRegex() { return multilineRegex(this.regex); },
        get toHtml() { return match => toNestedList(this, match[0]); } 
    },
    {
        type: 'table',
        regex: /\|(.*)\|/,  // Look at right aligned
        get groupRegex() { return multilineRegex(this.regex); },
        get toHtml() { return match => toTable(this, match[0]) }
        // get toHtml() {
        //     return match => toMultiLineHtml(
        //         this, match[0], (item, rowIndex, group) => toTableRow(item, rowIndex, group));
        // } 
    },
    {
        type: 'div',
        classNames: ['fencing'],
        regex: /(.*)/,
        get groupRegex() { return /^```[\s\w]*\n((.*)\n?)+?```/; },
        get toHtml() { 
            return match => toMultiLineHtml(
                this, 
                match[0].split('\n').slice(1, -1).join('\n'), 
                item => `${indentation()}<code>${item.replace(/\s/, '&nbsp')}</code>`); 
                // slice removes the ticks
        }
    },
    {
        type: 'div',
        classNames: ['fencing'],
        regex: /\s{4}(.*)/,
        get groupRegex() { return multilineRegex(this.regex); },
        get toHtml() {
            return match => toMultiLineHtml(
                this, match[0], item => `${indentation()}<code>${item}</code>`)
        }
    },
    {
        type: 'blockquote',
        regex: /[>\s]+(.*)/,
        get groupRegex() { return multilineRegex(this.regex); },
        get toHtml() {
            return match => toNestedBlockquotes(this, match[0]);
        } 
    }
];

const paragraphElement = {
    type: 'p',
    regex: /^(.+)/,
    get groupRegex() { return this.regex; },
    toHtml: match => `<p>${match[1]}</p>`
}

function markdownToHtml(markdown) {
    const html = [];

    while(markdown.length > 0) {
        // Can this be made more efficient not in the while loop?
        markdown = markdown.split('\n').filter(line => line).join('\n');

        const blockElement = blockElements.find(e => markdown.match(e.groupRegex)) || paragraphElement;
        const markdownGroup = markdown.match(blockElement.groupRegex);

        console.log(markdownGroup);

        const htmlGroup = blockElement.toHtml(markdownGroup);

        console.log(htmlGroup);

        const inlineFormattedHtml = formatInlineElements(htmlGroup);

        html.push(inlineFormattedHtml);

        const deletionRegex = blockElement.hasOwnProperty('deletionRegex') 
            ? blockElement.deletionRegex(markdownGroup) 
            : blockElement.groupRegex;

        markdown = markdown.replace(deletionRegex, '');
    }

    const htmlResult = html.join('\n\n');

    return htmlResult;
}

const markdownSection = document.getElementById('markdown');
const htmlSection = document.getElementById('html');
const result = document.getElementById('result');

function run() {
    const markdown = markdownSection.value;
    const html = markdownToHtml(markdown);

    htmlSection.innerText = html;
    result.innerHTML = html;
}

const runButton = document.getElementById('run-button');
runButton.addEventListener('click', run);


// markdownSection.value = `
// # Joe Bloggs

// ![professional photo](https://www.neilsonreeves.co.uk/wp-content/uploads/corporate-headshot-plain-neutral-background.jpg)

// ## Introduction
// ---
// Lorem _ipsum_ dolor sit amet, \`consectetur adipiscing\` elit. \`Maecenas\` tristique justo nisl, non commodo tellus consequat ut. Duis quis augue nibh. [Aliquam](https://www.example.com) erat [volutpat](https://www.example.com). Duis nisi neque, efficitur ut ipsum nec, eleifend pulvinar augue. Aliquam lobortis enim leo. Orci varius natoque penatibus et **maximus** mattis.

// ## Skills
// ---
// > Pellentesque **pellentesque**, est sit amet feugiat imperdiet, tortor augue mollis lorem, et commodo magna mi eu nisi. Duis a imperdiet orci, at molestie odio. Nulla efficitur tortor quis eros dictum mollis. Curabitur porttitor vulputate turpis tincidunt ornare. Donec fringilla leo vitae malesuada. Maecenas quis **mi** diam. 

// * C# and stuff
//   * Lorem _ipsum_ dolor sit amet
//     * consectetur adipiscing
//       * tristique justo nisl, 
//       * non commodo tellus 
//   * Orci varius natoque 
//     * consequat ut. Duis 
//     * quis augue nibh. [Aliquam](https://www.example.com) 
// * Javascript
// * Python

// ## Education
// ---
// 1. **2017-2020**: University of Life
// 1. **2009-2016**: School of Rock
// 1. **2003-2009**: Springfield Elementary

// ## Work History
// ---
// | Date              | Position           | Company        | Responsibilities |
// |-------------------|--------------------|----------------|------------------|
// |Feb 2021 - present | Software Developer | NBS            | Developing       |
// |Feb 2018 - Feb 2021| Junior Developer   | Gilmond        | Learning         |
// |Jun 2006 - Sep 2020| Teacher            | Star Education | Teaching         |

// ## Portfolio
// ---
// \`\`\`
// {
//   "firstName": "Joe",
//   "lastName": "Bloggs",
//   "age": 25
// }
// \`\`\`
// `;

markdown.value = `
### [Footnotes](https://github.com/markdown-it/markdown-it-footnote)

Footnote 1 link[^first].

Footnote 2 link[^second].

Inline footnote^[Text of inline footnote] definition.

Duplicated footnote reference[^second].

[^first]: Footnote **can have markup**

    and multiple paragraphs.

[^second]: Footnote text.
`;

run();