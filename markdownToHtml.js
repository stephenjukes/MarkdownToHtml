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

markdown.value = `
---
__Advertisement :)__

- __[pica](https://nodeca.github.io/pica/demo/)__ - high quality and fast image
  resize in browser.
- __[babelfish](https://github.com/nodeca/babelfish/)__ - developer friendly
  i18n with plurals support and easy syntax.

You will like those projects!

---

# h1 Heading 8-)
## h2 Heading
### h3 Heading
#### h4 Heading
##### h5 Heading
###### h6 Heading


## Horizontal Rules

___

---

***


## Typographic replacements

Enable typographer option to see result.

(c) (C) (r) (R) (tm) (TM) (p) (P) +-

test.. test... test..... test?..... test!....

!!!!!! ???? ,,  -- ---

"Smartypants, double quotes" and 'single quotes'


## Emphasis

**This is bold text**

__This is bold text__

*This is italic text*

_This is italic text_

~~Strikethrough~~


## Blockquotes


> Blockquotes can also be nested...
>> ...by using additional greater-than signs right next to each other...
> > > ...or with spaces between arrows.


## Lists

Unordered

+ Create a list by starting a line with '+', '-', or '*'
+ Sub-lists are made by indenting 2 spaces:
  - Marker character change forces new list start:
    * Ac tristique libero volutpat at
    + Facilisis in pretium nisl aliquet
    - Nulla volutpat aliquam velit
+ Very easy!

Ordered

1. Lorem ipsum dolor sit amet
2. Consectetur adipiscing elit
3. Integer molestie lorem at massa


1. You can use sequential numbers...
1. ...or keep all the numbers as '1.'

Start numbering with offset:

57. foo
1. bar


## Code

Inline 'code'

Indented code

    // Some comments
    line 1 of code
    line 2 of code
    line 3 of code


Block code "fences"

\`\`\`
Sample text here...
\`\`\`

Syntax highlighting

\`\`\` js
var foo = function (bar) {
  return bar++;
};

console.log(foo(5));
\`\`\`

## Tables

| Option | Description |
| ------ | ----------- |
| data   | path to data files to supply the data that will be passed into templates. |
| engine | engine to be used for processing templates. Handlebars is the default. |
| ext    | extension to be used for dest files. |

Right aligned columns

| Option | Description |
| ------:| -----------:|
| data   | path to data files to supply the data that will be passed into templates. |
| engine | engine to be used for processing templates. Handlebars is the default. |
| ext    | extension to be used for dest files. |


## Links

[link text](http://dev.nodeca.com)

[link with title](http://nodeca.github.io/pica/demo/ "title text!")

Autoconverted link https://github.com/nodeca/pica (enable linkify to see)


## Images

![Minion](https://octodex.github.com/images/minion.png)
![Stormtroopocat](https://octodex.github.com/images/stormtroopocat.jpg "The Stormtroopocat")

Like links, Images also have a footnote style syntax

![Alt text][id]

With a reference later in the document defining the URL location:

[id]: https://octodex.github.com/images/dojocat.jpg  "The Dojocat"


## Plugins

The killer feature of 'markdown-it' is very effective support of
[syntax plugins](https://www.npmjs.org/browse/keyword/markdown-it-plugin).


### [Emojies](https://github.com/markdown-it/markdown-it-emoji)

> Classic markup: :wink: :crush: :cry: :tear: :laughing: :yum:
>
> Shortcuts (emoticons): :-) :-( 8-) ;)

see [how to change output](https://github.com/markdown-it/markdown-it-emoji#change-output) with twemoji.


### [Subscript](https://github.com/markdown-it/markdown-it-sub) / [Superscript](https://github.com/markdown-it/markdown-it-sup)

- 19^th^
- H~2~O


### [\<ins>](https://github.com/markdown-it/markdown-it-ins)

++Inserted text++


### [\<mark>](https://github.com/markdown-it/markdown-it-mark)

==Marked text==


### [Footnotes](https://github.com/markdown-it/markdown-it-footnote)

Footnote 1 link[^first].

Footnote 2 link[^second].

Inline footnote^[Text of inline footnote] definition.

Duplicated footnote reference[^second].

[^first]: Footnote **can have markup**

    and multiple paragraphs.

[^second]: Footnote text.


### [Definition lists](https://github.com/markdown-it/markdown-it-deflist)

Term 1

:   Definition 1
with lazy continuation.

Term 2 with *inline markup*

:   Definition 2

        { some code, part of Definition 2 }

    Third paragraph of definition 2.

_Compact style:_

Term 1
  ~ Definition 1

Term 2
  ~ Definition 2a
  ~ Definition 2b


### [Abbreviations](https://github.com/markdown-it/markdown-it-abbr)

This is HTML abbreviation example.

It converts "HTML", but keep intact partial entries like "xxxHTMLyyy" and so on.

*[HTML]: Hyper Text Markup Language

### [Custom containers](https://github.com/markdown-it/markdown-it-container)

::: warning
*here be dragons*
:::

`;

run();
