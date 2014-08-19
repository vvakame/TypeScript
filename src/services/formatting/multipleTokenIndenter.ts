//
// Copyright (c) Microsoft Corporation.  All rights reserved.
// 
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//

///<reference path='formatting.ts' />

module ts.formatting {

    export class MultipleTokenIndenter extends IndentationTrackingWalker {
        private _edits: TextEditInfo[] = [];

        constructor(textSpan: TypeScript.TextSpan, sourceUnit: SourceFile, snapshot: ITextSnapshot, indentFirstToken: boolean, options: TypeScript.FormattingOptions) {
            super(textSpan, sourceUnit, snapshot, indentFirstToken, options);
        }

        public indentToken(token: Node, indentationAmount: number, commentIndentationAmount: number): void {
            // Ignore generated tokens
            if (token.getFullWidth() === 0) {
                return;
            }

            // If we have any skipped tokens as children, do not process this node for indentation or formatting
            if (this.parent().hasSkippedOrMissingTokenChild()) {
                return;
            }

            // Be strict, and only consider nodes that fall inside the span. This avoids indenting a multiline string
            // on enter at the end of, as the whole token was not included in the span
            var tokenSpan = new TypeScript.TextSpan(this.position() +  getLeadingTriviaWidth(token), token.getWidth());
            if (!this.textSpan().containsTextSpan(tokenSpan)) {
                return;
            }

            // Compute an indentation string for this token
            var indentationString = indentationString(indentationAmount, this.options);

            var commentIndentationString = indentationString(commentIndentationAmount, this.options);

            // Record any needed indentation edits
            this.recordIndentationEditsForToken(token, indentationString, commentIndentationString);
        }

        public edits(): TextEditInfo[]{
            return this._edits;
        }

        public recordEdit(position: number, length: number, replaceWith: string): void {
            this._edits.push(createTextEditInfo(position, length, replaceWith));
        }

        private recordIndentationEditsForToken(token: Node, indentationString: string, commentIndentationString: string) {
            var position = this.position();
            var indentNextTokenOrTrivia = true;
            var leadingWhiteSpace = ""; // We need to track the whitespace before a multiline comment

            // Process any leading trivia if any
            var triviaList = getLeadingTrivia(token);
            if (triviaList) {
                for (var i = 0, length = triviaList.length; i < length; i++, position += trivia.fullWidth) {
                    var trivia = triviaList[i];
                    // Skip this trivia if it is not in the span
                    if (!this.textSpan().containsTextSpan(new TypeScript.TextSpan(position, trivia.fullWidth))) {
                        continue;
                    }

                    switch (trivia.kind) {
                        case SyntaxKind.MultiLineCommentTrivia:
                            // We will only indent the first line of the multiline comment if we were planning to indent the next trivia. However,
                            // subsequent lines will always be indented
                            this.recordIndentationEditsForMultiLineComment(trivia, position, commentIndentationString, leadingWhiteSpace, !indentNextTokenOrTrivia /* already indented first line */);
                            indentNextTokenOrTrivia = false;
                            leadingWhiteSpace = "";
                            break;

                        case SyntaxKind.SingleLineCommentTrivia:
                        // COMMENTED OUT
                        //case SyntaxKind.SkippedTokenTrivia:
                            if (indentNextTokenOrTrivia) {
                                this.recordIndentationEditsForSingleLineOrSkippedText(trivia, position, commentIndentationString);
                                indentNextTokenOrTrivia = false;
                            }
                            break;

                        case SyntaxKind.WhitespaceTrivia:
                            // If the next trivia is a comment, use the comment indentation level instead of the regular indentation level
                            // If the next trivia is a newline, this whole line is just whitespace, so don't do anything (trimming will take care of it)
                            var nextTrivia = length > i + 1 && triviaList[i + 1];
                            var whiteSpaceIndentationString = nextTrivia && nextTrivia.isComment ? commentIndentationString : indentationString;
                            if (indentNextTokenOrTrivia) {
                                if (!(nextTrivia && nextTrivia.isNewLine)) {
                                    this.recordIndentationEditsForWhitespace(trivia, position, whiteSpaceIndentationString);
                                }
                                indentNextTokenOrTrivia = false;
                            }
                            leadingWhiteSpace += getTriviaText(trivia, this.sourceUnit);
                            break;

                        case SyntaxKind.NewLineTrivia:
                            // We hit a newline processing the trivia.  We need to add the indentation to the 
                            // next line as well.  Note: don't bother indenting the newline itself.  This will 
                            // just insert ugly whitespace that most users probably will not want.
                            indentNextTokenOrTrivia = true;
                            leadingWhiteSpace = "";
                            break;

                        default:
                            throw TypeScript.Errors.invalidOperation();
                    }
                }

            }

            if (token.kind !== SyntaxKind.EndOfFileToken && indentNextTokenOrTrivia) {
                // If the last trivia item was a new line, or no trivia items were encounterd record the 
                // indentation edit at the token position
                if (indentationString.length > 0) {
                    this.recordEdit(position, 0, indentationString);
                }
            }
        }

        private recordIndentationEditsForSingleLineOrSkippedText(trivia: Trivia, fullStart: number, indentationString: string): void {
            // Record the edit
            if (indentationString.length > 0) {
                this.recordEdit(fullStart, 0, indentationString);
            }
        }

        private recordIndentationEditsForWhitespace(trivia: Trivia, fullStart: number, indentationString: string): void {
            var text = getTriviaText(trivia, this.sourceUnit);

            // Check if the current indentation matches the desired indentation or not
            if (indentationString === text) {
                return;
            }

            // Record the edit 
            this.recordEdit(fullStart, text.length, indentationString);
        }

        private recordIndentationEditsForMultiLineComment(trivia: Trivia, fullStart: number, indentationString: string, leadingWhiteSpace: string, firstLineAlreadyIndented: boolean): void {
            // If the multiline comment spans multiple lines, we need to add the right indent amount to
            // each successive line segment as well.
            var position = fullStart;
            var segments = splitMultiLineCommentTriviaIntoMultipleLines(trivia);

            if (segments.length <= 1) {
                if (!firstLineAlreadyIndented) {
                    // Process the one-line multiline comment just like a single line comment
                    this.recordIndentationEditsForSingleLineOrSkippedText(trivia, fullStart, indentationString);
                }
                return;
            }

            // Find number of columns in first segment
            var whiteSpaceColumnsInFirstSegment = columnForPositionInString(leadingWhiteSpace, leadingWhiteSpace.length, this.options);
            
            var indentationColumns = columnForPositionInString(indentationString, indentationString.length, this.options);
            var startIndex = 0;
            if (firstLineAlreadyIndented) {
                startIndex = 1;
                position += segments[0].length;
            }
            for (var i = startIndex; i < segments.length; i++) {
                var segment = segments[i];
                this.recordIndentationEditsForSegment(segment, position, indentationColumns, whiteSpaceColumnsInFirstSegment);
                position += segment.length;
            }
        }

        private recordIndentationEditsForSegment(segment: string, fullStart: number, indentationColumns: number, whiteSpaceColumnsInFirstSegment: number): void {
            // Indent subsequent lines using a column delta of the actual indentation relative to the first line
            var firstNonWhitespacePosition = firstNonWhitespacePosition(segment);
            var leadingWhiteSpaceColumns = columnForPositionInString(segment, firstNonWhitespacePosition, this.options);
            var deltaFromFirstSegment = leadingWhiteSpaceColumns - whiteSpaceColumnsInFirstSegment;
            var finalColumns = indentationColumns + deltaFromFirstSegment;
            if (finalColumns < 0) {
                finalColumns = 0;
            }
            var indentationString = indentationString(finalColumns, this.options);
            
            if (firstNonWhitespacePosition < segment.length &&
                TypeScript.CharacterInfo.isLineTerminator(segment.charCodeAt(firstNonWhitespacePosition))) {
                // If this segment was just a newline, then don't bother indenting it.  That will just
                // leave the user with an ugly indent in their output that they probably do not want.
                return;
            }

            if (indentationString === segment.substring(0, firstNonWhitespacePosition)) {
                return;
            }

            // Record the edit 
            this.recordEdit(fullStart, firstNonWhitespacePosition, indentationString);
        }
    }
}