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

    //export function getIndentationForSingleToken(position: number, sourceFile: SourceFile, textSnapshot: ITextSnapshot, formattingOptions: TypeScript.FormattingOptions): number {
    //    var span = new TypeScript.TextSpan(position, 1);
    //    var indentationAmount: number;

    //    function indentToken(token: Node, indentationAmount: number, commentIndentationAmount: number, state: WalkState) {
    //        // Compute an indentation string for this token
    //        if (token.getFullWidth() === 0 || (this.indentationPosition - this.position() < token.leadingTriviaWidth())) {
    //            // The position is in the leading trivia, use comment indentation
    //            this.indentationAmount = commentIndentationAmount;
    //        }
    //        else {
    //            this.indentationAmount = indentationAmount;
    //        }
    //    }

    //    indentFile(span, sourceFile, textSnapshot, /*indentFirstToken*/ true, formattingOptions, { indent: indentToken });

    //    return indentationAmount;
    //}

    export class SingleTokenIndenter extends IndentationTrackingWalker {
        private indentationAmount: number = null;
        private indentationPosition: number;

        constructor(indentationPosition: number, sourceUnit: SourceFile, snapshot: ITextSnapshot, indentFirstToken: boolean, options: TypeScript.FormattingOptions) {
            super(new TypeScript.TextSpan(indentationPosition, 1), sourceUnit, snapshot, indentFirstToken, options);

            this.indentationPosition = indentationPosition;
        }

        public static getIndentationAmount(position: number, sourceUnit: SourceFile, snapshot: ITextSnapshot, options: TypeScript.FormattingOptions): number {
            var walker = new SingleTokenIndenter(position, sourceUnit, snapshot, true, options);
            visitNodeOrToken(sourceUnit, walker);
            //visitNodeOrToken(walker, sourceUnit);
            return walker.indentationAmount;
        }

        public indentToken(token: Node, indentationAmount: number, commentIndentationAmount: number): void {
            // Compute an indentation string for this token
            if (token.getFullWidth() === 0 || (this.indentationPosition - this.position() < getLeadingTriviaWidth(token))) {
                // The position is in the leading trivia, use comment indentation
                this.indentationAmount = commentIndentationAmount;
            }
            else {
                this.indentationAmount = indentationAmount;
            }
        }
    }
}