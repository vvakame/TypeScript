/// <reference path='fourslash.ts' />

/////*1*/let test:number=true?1:0;
/////*2*/function RGBtoHSB( param1: Int, param2: Int, param3: Int ):void{} 

format.setOption("insertSpaceBeforeTypeAnnotation", true);

format.document();

goTo.marker('1');
verify.currentLineContentIs('let test : number = true?1:0;');
goTo.marker('2');
verify.currentLineContentIs('function RGBtoHSB( param1: Int, param2: Int, param3: Int ):void{}');
