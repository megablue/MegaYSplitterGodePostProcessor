var IMULTIPLIER = 100000;

console.log("Mega YSplitter Gcode Post Processor v1.0");

var args = process.argv,
    filename = '';

for(var i = 0, parts = []; i < args.length; i++){
	parts = args[i].split('.');

	if(parts.length > 0){
		if(parts[parts.length-1].toLowerCase() == 'gcode' || parts[parts.length-1].toLowerCase() == 'gco'){
			filename = args[i];
		}
	}
}

if(filename.length == 0){
	console.log("Please provide the path and filename for the gcode you want to processs. eg: node toolchange.js 3dbenchy.gcode");
}

var consts = require('constants'),
    fs  = require("fs"), 
    LineByLineReader = require('line-by-line'),
    outputName = filename.split('.gcode')[0] + '_processed.gcode';

var	infillBeginsMarker = /^; infill$/, //S3D specific
	infillStopsMarker = /^; /;    //S3D specific

function processToolchange(){
	//var startupTemplate = fs.readFileSync('startup-template.txt').toString();
	var lr = new LineByLineReader(filename);
	var toolchangeTemplate = fs.readFileSync('toolchange-template.txt').toString();
	var fd = fs.openSync('./' + outputName, 'w');
	var buffer = '';
	var toolchangeCount = 0;
	var foundToolChangeMarker = false;
	var newtoolNumber = -1;
	var oldtoolNumber = -1;
	//var startupMakerFound = false;
	//var matchStartup = /^;STARTUPBEGINS/;
	var matchToolChange =/^;TOOLCHANGE NEW(\d) OLD(\d)/;
	var matchToolChangeXY = /^G1 (X-?\d{0,}.\d{0,}) (Y-?\d{0,}.\d{0,})/i;

	lr.on('line', function (line) {
		if(foundToolChangeMarker){
			var xyResult = line.match(matchToolChangeXY);
			if(xyResult != null){
				var x = xyResult[1];
				var y = xyResult[2];
				var xy = x + ' ' + y;
				//console.log('Next XY Coordinate: ' + xy);
				buffer += renderToolChange(toolchangeTemplate, newtoolNumber, oldtoolNumber, xy);
				fs.appendFileSync(fd, buffer + "\n");
				buffer = '';
				foundToolChangeMarker = false;
			}
			return;
		}

		var toolchangeResult = line.match(matchToolChange);
		var toolSwitched = false;

		if(toolchangeResult != null){
			newtoolNumber = toolchangeResult[1];
			oldtoolNumber = toolchangeResult[2];
			
			if(newtoolNumber != oldtoolNumber){
				toolSwitched = true;
				foundToolChangeMarker = true;
			}

			if(toolSwitched){
				console.log('New tool: ' + newtoolNumber + ', Old tool: ' + oldtoolNumber);
			} else {
				console.log('Tool not switched');
			}
		} else {
			buffer += line + "\n";
		}
	});

	lr.on('error', function (err) {
		// 'err' contains error object
		console.log('ERROR!!!');
		console.log(err);
	});

	lr.on('end', function () {
		// All lines are read, file is closed now.
		//write the remaining buffer into the output file
		if(buffer.length > 0){
			fs.appendFileSync(fd, buffer + "\n");
		}

		console.log('Gcode processed!');
	});

	// function renderStartup(template, z){
	// 	template = template.replace("\r\n", "\n");
	//     template = template.replace(/^\s*\n/gm, "\n");
	//     template = template.replace('{Z}', z);
	//     return template;
	// }

	function renderToolChange(template, newtool, oldtool, xy){
	    template = template.replace("\r\n", "\n");
	    template = template.replace(/^\s*\n/gm, "\n");
	    template = template.replace('{NEWTOOL}', newtool);
	    template = template.replace('{OLDTOOL}', oldtool);
	    template = template.replace('{XY}', xy);
	    return template;
	}
}

//gather data and process the first pass
function firstPass(){
	var lr = new LineByLineReader(filename),
		lineCounter = 0,
		buffer = '',
		slicer = '',
		slicerDetected = false,
		startupGcodeMarker = /^;end of startup gcode$/i,
		slicerSettingMarker = /^;\s{3}(\w+),(.*)/,
		slicerSettingLinesCount = 0,
		slicerSettingLinesLimit = 200,
		slicerSettingStarted = false,
		slicerSettingParsed = false,
		toolChangeMarker = /^T(\d+)$/,
		extrudeMarker = /^G1.*E(\d{1,}.{0,1}\d{1,})/,
		layerChangeMarker = /^;.*layer+/i;

	var firstLayerDetected = false,
		currentTool = -1,
		numberOfTools = 1,
		toolchangeDetected = false,
		layersInfo = [],
		layerHeight = 0,
		layerHeightDetected = false,
		firstLayerHeightPercentage = 0,
		firstLayerHeightPercentageDetected = false,
		printPerimetersInsideOut = false,
		infillPercentage = 0,
		layerIndex = -1,
		infilling = false,
		infillLength = 0,
		infillCounted = false;

	var lineProcessGcode = function (line){
		var toolChangeMatched = line.match(toolChangeMarker),
			newLayerMatched = line.match(layerChangeMarker),
			infillBeginsMatched = slicer == 'S3D' ? line.match(infillBeginsMarker) : false,
			infillStopsMatched  = slicer == 'S3D' ? line.match(infillStopsMarker) : false;

		if(toolChangeMatched && layersInfo[layerIndex]){
			layersInfo[layerIndex].toolChange =  toolChangeMatched[1] * 1;
			//console.log("toolChange Detected, new tool: " + layersInfo[layerIndex].toolChange);
		}

		if(newLayerMatched){

			if(infillCounted){
				infillCounted = false;
				infilling = false;

				if(infillLength > 0){
					layersInfo[layerIndex].S3DInfillLength = (infillLength/IMULTIPLIER).toFixed(4);
					console.log("Layer: " + layerIndex + ", Purge-able Infill length: " + layersInfo[layerIndex].S3DInfillLength + ", Gcode:");
					console.log(layersInfo[layerIndex].S3DInfill);
				}
			}

			++layerIndex;

			if(!firstLayerDetected){
				firstLayerDetected = true;
			}

			//console.log("New layer detected! Layer Count: " + layerIndex);
			layersInfo[layerIndex] = {toolChange: -1, infillLength: 0, S3DInfill: ''};			
			infillLength = 0;
		}

		if(infillBeginsMatched){
			infilling = true;
		} else if(infillStopsMatched){
			infilling = false;
		}

		if(slicer == 'S3D' && infilling){

			if(layersInfo[layerIndex] && layersInfo[layerIndex].toolChange > -1){
				extrudeMatched = line.match(extrudeMarker);

				if(extrudeMatched){
					//console.log("E: " + extrudeMatched[1]);
					infillLength += extrudeMatched[1] * IMULTIPLIER;
					infillCounted = true;
					//console.log("Line: " + lineCounter + ", E=" + extrudeMatched[1]);
				}
			}

			layersInfo[layerIndex].S3DInfill += line + "\n";
		}
	}

	var lineProcessSlicerSettings = function (line){
		if(!slicerSettingParsed && slicerSettingLinesCount > slicerSettingLinesLimit){
			console.log("Error: unable to determine slicer settings after " + slicerSettingLinesCount + " lines parsed.");
			// probably due the bug in line-by-line, 
			// pause() have to be executed before close() otherwise it will continues to run
			lr.pause(); 
			lr.close();
		}

		var slicerSettingMatched = line.match(slicerSettingMarker),
			slicerIsS3DMatched = !slicerDetected ? line.match(/^;.*Simplify3D/) : false;

		if(slicerSettingMatched){
			//console.log(slicerSettingMatched);
			slicerSettingStarted = true;

			if(slicerSettingMatched[1] == 'layerHeight'){
				layerHeight = slicerSettingMatched[2] * 1;
				layerHeightDetected = true;
				console.log("layerHeight: " + layerHeight );
			}

			if(slicerSettingMatched[1] == 'firstLayerHeightPercentage'){
				firstLayerHeightPercentage = slicerSettingMatched[2] * 1;
				firstLayerHeightPercentageDetected = true;
				console.log("First layerHeight: " + (layerHeight * firstLayerHeightPercentage / 100).toFixed(3) );
			}

			if(slicerSettingMatched[1] == 'printPerimetersInsideOut'){
				
				if(slicerSettingMatched[2] * 1 == 1){
					printPerimetersInsideOut = true;
				}

				console.log("printPerimetersInsideOut: " + printPerimetersInsideOut );
			}
		} else {
			if(slicerIsS3DMatched){
				slicerDetected = true;
				slicer = 'S3D';
				console.log("Slicer: Simplify3D");
			}
		}

		//conditions to detect end of slicer settings
		if(slicerSettingStarted && !slicerSettingMatched){
			slicerSettingParsed = true;
		}

		if(!slicerSettingStarted){
			slicerSettingLinesCount++;
		}
	}

	var processLine = function(line){
		++lineCounter;
		if(!slicerSettingParsed){
			lineProcessSlicerSettings(line);
		} else {
			lineProcessGcode(line);
		}
	}

	lr.on('line', processLine);

	lr.on('error', function (err) {
		// 'err' contains error object
		console.log('ERROR!!!');
		console.log(err);
	});

	lr.on('end', function () {
		console.log('First-pass... Done!');
	});
}

firstPass();
//processToolchange();