///<reference path='references.ts' />

module ts.formatting {
    export function columnForEndOfTokenAtPosition(sourceFile: SourceFile, position: number, options: TypeScript.FormattingOptions): number {
        var token = findToken(sourceFile, position);
        return columnForStartOfTokenAtPosition(sourceFile, position, options) + token.getWidth();
    }

    export function columnForStartOfTokenAtPosition(sourceFile: SourceFile, position: number, options: TypeScript.FormattingOptions): number {
        var token = findToken(sourceFile, position);

        // Walk backward from this token until we find the first token in the line.  For each token 
        // we see (that is not the first tokem in line), push the entirety of the text into the text 
        // array.  Then, for the first token, add its text (without its leading trivia) to the text
        // array.  i.e. if we have:
        //
        //      var foo = a => bar();
        //
        // And we want the column for the start of 'bar', then we'll add the underlinded portions to
        // the text array:
        //
        //      var foo = a => bar();
        //                  _
        //                __
        //              __
        //          ____
        //      ____
        var firstTokenInLine = firstTokenInLineContainingPosition(sourceFile, token.getFullStart());
        var leadingTextInReverse: string[] = [];

        var current = token;
        while (current !== firstTokenInLine) {
            current = getPreviousToken(current);

            if (current === firstTokenInLine) {
                // We're at the first token in teh line.
                // We don't want the leading trivia for this token.  That will be taken care of in
                // columnForFirstNonWhitespaceCharacterInLine.  So just push the trailing trivia
                // and then the token text.
                leadingTextInReverse.push(getTrailingTriviaFullText(current));
                leadingTextInReverse.push(current.getText());
            }
            else {
                // We're at an intermediate token on the line.  Just push all its text into the array.
                leadingTextInReverse.push(current.getFullText());
            }
        }

        // Now, add all trivia to the start of the line on the first token in the list.
        collectLeadingTriviaTextToStartOfLine(sourceFile, firstTokenInLine, leadingTextInReverse);

        return columnForLeadingTextInReverse(leadingTextInReverse, options);
    }

    export function columnForStartOfFirstTokenInLineContainingPosition(sourceFile: SourceFile, position: number, options: TypeScript.FormattingOptions): number {
        // Walk backward through the tokens until we find the first one on the line.
        var firstTokenInLine = firstTokenInLineContainingPosition(sourceFile, position);
        var leadingTextInReverse: string[] = [];

        // Now, add all trivia to the start of the line on the first token in the list.
        collectLeadingTriviaTextToStartOfLine(sourceFile, firstTokenInLine, leadingTextInReverse);

        return columnForLeadingTextInReverse(leadingTextInReverse, options);
    }

    // Collect all the trivia that precedes this token.  Stopping when we hit a newline trivia
    // or a multiline comment that spans multiple lines.  This is meant to be called on the first
    // token in a line.
    function collectLeadingTriviaTextToStartOfLine(sourceFile: SourceFile, firstTokenInLine: Node,
                                                   leadingTextInReverse: string[]) {
        var leadingTrivia =  getLeadingTrivia(firstTokenInLine);

        for (var i = leadingTrivia.length - 1; i >= 0; i--) {
            var trivia = leadingTrivia[i];
            if (trivia.kind === SyntaxKind.NewLineTrivia) {
                break;
            }

            if (trivia.kind === SyntaxKind.MultiLineCommentTrivia) {
                var lineSegments = splitMultiLineCommentTriviaIntoMultipleLines(trivia);
                leadingTextInReverse.push(TypeScript.ArrayUtilities.last(lineSegments));

                if (lineSegments.length > 0) {
                    // This multiline comment actually spanned multiple lines.  So we're done.
                    break;
                }

                // It was only on a single line, so keep on going.
            }

            leadingTextInReverse.push(getTriviaText(trivia, sourceFile));
        }
    }

    function columnForLeadingTextInReverse(leadingTextInReverse: string[],
                                           options: TypeScript.FormattingOptions): number {
        var column = 0;

        // walk backwards.  This means we're actually walking forward from column 0 to the start of
        // the token.
        for (var i = leadingTextInReverse.length - 1; i >= 0; i--) {
            var text = leadingTextInReverse[i];
            column = columnForPositionInStringWorker(text, text.length, column, options);
       }

        return column;
    }

    // Returns the column that this input string ends at (assuming it starts at column 0).
    export function columnForPositionInString(input: string, position: number, options: TypeScript.FormattingOptions): number {
        return columnForPositionInStringWorker(input, position, 0, options);
    }
    
    function columnForPositionInStringWorker(input: string, position: number, startColumn: number, options: TypeScript.FormattingOptions): number {
        var column = startColumn;
        var spacesPerTab = options.spacesPerTab;

        for (var j = 0; j < position; j++) {
            var ch = input.charCodeAt(j);

            if (ch === CharacterCodes.tab) {
                column += spacesPerTab - column % spacesPerTab;
            }
            else {
                column++;
            }
        }

        return column;
    }

    export function indentationString(column: number, options: TypeScript.FormattingOptions): string {
        var numberOfTabs = 0;
        var numberOfSpaces = Math.max(0, column);

        if (options.useTabs) {
            numberOfTabs = Math.floor(column / options.spacesPerTab);
            numberOfSpaces -= numberOfTabs * options.spacesPerTab;
        }

        return TypeScript.StringUtilities.repeat('\t', numberOfTabs) +
               TypeScript.StringUtilities.repeat(' ', numberOfSpaces);
    }

    export function firstNonWhitespacePosition(value: string): number {
        for (var i = 0; i < value.length; i++) {
            var ch = value.charCodeAt(i);
            if (!TypeScript.CharacterInfo.isWhitespace(ch)) {
                return i;
            }
        }

        return value.length;
    }
}