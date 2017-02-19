var IMULTIPLIER = 100000;
var DEBUGMODE = false;

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
	process.exit();
}

const path = require('path');
var consts = require('constants'),
    fs  = require("fs"), 
    LineByLineReader = require('line-by-line'),
    PrimeTower = require(path.resolve(__dirname, 'primetower.js')),
    outputName = filename.split('.gcode')[0] + '.gcode';

var	slicer = '',
	layersInfo = [],
	pTower = {},
	toolTempMaker = /^M109 S(\d+) T(\d+)$/,
	towerBeginsMarker = /^; prime pillar$/, //S3D specific
	towerStopsMarker = /^;/,    //S3D specific
	infillBeginsMarker = /^; infill$/, //S3D specific
	infillStopsMarker = /^;/,    //S3D specific
	layerChangeMarker = /^; layer (\d+), Z = (\d+.{0,}\d{0,})/; //S3D specific
	toolChangeMarker = /^T(\d+)$/,
	slicerSettingsTotalLines = 0,
	layerHeight = 0,
	firstLayerHeightPercentage = 0,
	firstLayerHeight = 0,
	toolsTemp = [];

var towerLocations = [];

towerLocations = [
	[xOffset= -25, yOffset = 0, rotation = 70],
	[xOffset= -45, yOffset = 0, rotation = 180],
];

var newName = filename.split('.gcode')[0] + '.org.gcode';

fs.renameSync(filename, newName);

filename = newName;

function processToolchange(){
	//var startupTemplate = fs.readFileSync('startup-template.txt').toString();
	var toolchangeTemplate = fs.readFileSync(path.resolve(__dirname,'toolchange-template.txt')).toString();
	var fd = fs.openSync(outputName, 'w');
	var buffer = '';
	var toolchangeCount = 0;
	var foundToolChangeMarker = false;
	var newtoolNumber = -1;
	var oldtoolNumber = -1;
	//var startupMakerFound = false;
	//var matchStartup = /^;STARTUPBEGINS/;
	var matchToolChange =/^;TOOLCHANGE NEW(\d) OLD(\d)/;
	var matchToolChangeXY = /^G1 (X-?\d{0,}.\d{0,}) (Y-?\d{0,}.\d{0,})/i;

	var currentZ = 0,
		currentLayer = -1,
		currentTool = -1,
		currentTowerIndex = 0,
		maxToolChange = -1,
		currentLine = 0,
		infilling = false,
		towering = false;

	//find out how many prime towers do we need
	maxToolChange = findMaxToolChange();
	console.log("Maximum per layer tool change: " + maxToolChange + ", Total predefined prime towers locations: " + towerLocations.length);

	if(maxToolChange > towerLocations.length){
		console.log("Insufficient predefined tower locations detected. ");
		console.log("If the gcode were produced by S3D, it is most likely caused by toolchange bugs in S3D.");
		console.log("Otherwise, it is likely that there is a bug in my script.");
		process.exit();
	}

	//console.log("Settings end at line# " + slicerSettingsTotalLines);
	//process.exit();

	var lr = new LineByLineReader(filename);

	lr.on('line', function (line) {

		if(++currentLine < slicerSettingsTotalLines){
			if(DEBUGMODE) console.log(line);
			fs.appendFileSync(fd, line + "\n");
			return;
		}

		var towerBeginsMatched = line.match(towerBeginsMarker),
			towerStopsMatched = line.match(towerStopsMarker),
			layerChangeMatched = line.match(layerChangeMarker),
			toolChangeMatched = line.match(toolChangeMarker),
			infillBeginsMatched = slicer == 'S3D' ? line.match(infillBeginsMarker) : false,
			infillStopsMatched  = slicer == 'S3D' ? line.match(infillStopsMarker) : false;

		//after the gibberish produced by the slicer
		//this is supposed to be the first line of your startup gcode
		if(currentLine == slicerSettingsTotalLines){
			//find the first toolchange
			var firstTool = findNextToolChangeLayer();

			//inject the first tool change command prior the original startup gcode.
			//we will ignore the first toolchange produced by s3d
			//hence this will allow us to specific the first tool to prime
			//during startup
			line = 'T' + firstTool + "\n" + line;
		}

		if(infillBeginsMatched){
			infilling = true;
		} else if(infillStopsMatched){
			infilling = false;
		}

		if(towerBeginsMatched){
			towering = true;

			var infillLength = layersInfo[currentLayer].S3DInfillLength,
				isFirstLayer = currentZ == firstLayerHeight,
				toolChangeGcode = '',
				toolChange = layersInfo[currentLayer].toolChange,
				tower,
				forceSaving = false;

			if(isFirstLayer){
				forceSaving = false;
			}

			if(toolChange == -1){
				forceSaving = true;
			}

			tower = pTower.render(isFirstLayer, currentZ, 
						towerLocations[currentTowerIndex][0], 
						towerLocations[currentTowerIndex][1], 
						towerLocations[currentTowerIndex][2], 
						infillLength, forceSaving);

			if(toolChange > -1){
				var toolChangeVariables = {
									'temp': toolsTemp[(toolChange).toString()],
									'newtool': toolChange,
									'oldtool': currentTool,
									'x': tower.originXY[0],
									'y': tower.originXY[1]
				}

				toolChangeGcode = renderToolChange(toolchangeTemplate, toolChangeVariables);
				fs.appendFileSync(fd, toolChangeGcode + "\n");

				currentTool = toolChange;
			}

			if(maxToolChange > 0){
				fs.appendFileSync(fd, "; Tower Index: " + currentTowerIndex + "\n");
				fs.appendFileSync(fd, tower.gcode + "\n");
				++currentTowerIndex;
			}

			if(layersInfo[currentLayer].S3DInfillLength){
				fs.appendFileSync(fd, "; Restructured Infill begins\n");
				fs.appendFileSync(fd, "; Infill e-length: " + layersInfo[currentLayer].S3DInfillLength + "\n");

				if(maxToolChange > 0){
					//insert the infill marker so that we can preview the infill as prime pillar
					fs.appendFileSync(fd, "; prime pillar\n");
					fs.appendFileSync(fd, "G92 E0\n");
					fs.appendFileSync(fd, "G1 E9.0000 F1500\n");
					fs.appendFileSync(fd, "G92 E0\n");
				} else {
					fs.appendFileSync(fd, "; infill\n");
				}

				fs.appendFileSync(fd, layersInfo[currentLayer].S3DInfill);
				fs.appendFileSync(fd, "; Restructured Infill ends\n");
			}

		} else if(towerStopsMatched){
			towering = false;
		}

		if(layerChangeMatched){
			currentZ = layerChangeMatched[2] * 1;
			maxToolChange = findMaxToolChange();
			currentTowerIndex = 0;
			infilling = false;
			towering = false;
			++currentLayer;
			fs.appendFileSync(fd, ";layerChangeMatched\n");
			fs.appendFileSync(fd, line + "\n");
		} else if(!towering && !infilling){

			if(!toolChangeMatched)
			fs.appendFileSync(fd, line + "\n");
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

	function renderToolChange(template, variables){
	    template = replaceAll(template, "\r\n", "\n");
	    template = template.replace(/^\s*\n/gm, "\n");
	    template = replaceAll(template, '{TEMP}', variables.temp);
	    template = replaceAll(template, '{NEWTOOL}', variables.newtool);
	    template = replaceAll(template, '{OLDTOOL}', variables.oldtool);
	    template = replaceAll(template, '{X}', variables.x);
	    template = replaceAll(template, '{Y}', variables.y);
	   
	    var regIfOldTool = new RegExp("^;IFOLDTOOL=" + variables.oldtool + " {0,}","gm"),
	   		regIfNewTool = new RegExp("^;IFNEWTOOL=" + variables.newtool + " {0,}","gm"),
	   		regIfNewTools = new RegExp(";IFNEWTOOL=.*\n","g"),
	   		regIfOldTools = new RegExp(";IFOLDTOOL=.*\n","g");

	   	template = template.replace(regIfOldTool, "");
	    template = template.replace(regIfNewTool, "");
	    template = template.replace(regIfNewTools, "");
	    template = template.replace(regIfOldTools, "");

		function escapeRegExp(str) {
		    return str.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
		}

	    function replaceAll(str, find, replace) {
  			return str.replace(new RegExp(escapeRegExp(find), 'g'), replace);
		}

	    return template;
	}

	//find out the next tool change? P/S: probably unneeded.
	function findNextToolChangeLayer(){
		if(layersInfo[currentLayer+1]){
			for(var i = currentLayer+1; i < layersInfo.length; i++){
				if(layersInfo[i].toolChangeTotal > 0){
					return i;
				}
			}
		}
		return -1;
	}

	//find the maximum tool change per layer from subsequence layers
	function findMaxToolChange(){
		var max = 0;
		var currentZ = 0;

		if(layersInfo[currentLayer+1]){
			for(var i = currentLayer+1; i < layersInfo.length; i++){
				if(layersInfo[i].toolChangeTotal > max){
					max = layersInfo[i].toolChangeTotal;
				}
			}
		}

		return max;
	}
}

//gather data and process the first pass
function firstPass(callback){
	var lr = new LineByLineReader(filename),
		lineCounter = 0,
		buffer = '',
		slicerDetected = false,
		startupGcodeMarker = /^;end of startup gcode$/i,
		slicerSettingMarker = /^;\s{3}(\w+),?(.*)/,
		slicerSettingLinesCount = 0,
		slicerSettingLinesLimit = 200,
		slicerSettingStarted = false,
		slicerSettingParsed = false,
		extrudeMarker = /^G1.*E(\d{1,}.{0,1}\d{1,})/,
		extrudeZeroingMarker = /^G92 E0/;

	var firstLayerDetected = false,
		currentTool = -1,
		numberOfTools = 1,
		toolchangeDetected = false,
		layerHeightDetected = false,
		firstLayerHeightPercentageDetected = false,
		printPerimetersInsideOut = false,
		infillPercentage = 0,
		layerIndex = -1,
		infilling = false,
		infillLength = 0,
		totalInfillLength = 0,
		infillCounted = false,
		currentZ = 0;

	var lineProcessGcode = function (line){
		var toolChangeMatched = line.match(toolChangeMarker),
			newLayerMatched = line.match(layerChangeMarker),
			infillBeginsMatched = slicer == 'S3D' ? line.match(infillBeginsMarker) : false,
			infillStopsMatched  = slicer == 'S3D' ? line.match(infillStopsMarker) : false;

		if(toolChangeMatched && layersInfo[layerIndex]){
			layersInfo[layerIndex].toolChange =  toolChangeMatched[1] * 1;
			++layersInfo[layerIndex].toolChangeTotal;
			//console.log("toolChange Detected, new tool: " + layersInfo[layerIndex].toolChange);
		}

		// if(newLayerMatched){
		// 	if(newLayerMatched[2] * 1 > currentZ){
		// 		currentZ = newLayerMatched[2] * 1;
		// 		newLayerMatched = true;
		// 	} else{
		// 		newLayerMatched = false;
		// 	}
		// }

		//startup gcode
		if(layerIndex == -1){
			var toolTempMatched = line.match(toolTempMaker);

			if(toolTempMatched){
				toolsTemp[toolTempMatched[2].toString()] = toolTempMatched[1];
				console.log("Tool %d: %dC", toolsTemp.length-1, toolsTemp[(toolsTemp.length-1).toString()]);
			}
		}

		if(newLayerMatched){
			// console.log("new layer detected " + newLayerMatched[1] );
			// console.log("new layer z " + newLayerMatched[2] );

			if(infillCounted){
				infillCounted = false;
				infilling = false;

				if(totalInfillLength > 0){
					//console.log(infillLengths);
					layersInfo[layerIndex].S3DInfillLength = (totalInfillLength/IMULTIPLIER).toFixed(4);
					//console.log("Layer: " + layerIndex + ", Purge-able Infill length: " + layersInfo[layerIndex].S3DInfillLength + ", Gcode:");
					//console.log(layersInfo[layerIndex].S3DInfill);
				}
			}

			++layerIndex;

			if(!firstLayerDetected){
				firstLayerDetected = true;
			}

			//console.log("New layer detected! Layer Count: " + layerIndex);
			layersInfo[layerIndex] = {toolChange: -1, toolChangeTotal: 0, S3DInfillLength: 0, S3DInfill: ''};			
			infillLength = 0;
			totalInfillLength = 0;
		}

		if(infillBeginsMatched){
			infilling = true;
		} else if(infillStopsMatched){
			infilling = false;
		}

		if(slicer == 'S3D' && infilling){

			if(layersInfo[layerIndex]){
				extrudeMatched = line.match(extrudeMarker);
				extrudeZeroMatched = line.match(extrudeZeroingMarker);

				if(extrudeMatched){
					infillLength = extrudeMatched[1] * IMULTIPLIER;
					infillCounted = true;
					//console.log("Line: " + lineCounter + ", E=" + extrudeMatched[1]);
				} else if (extrudeZeroMatched){
					totalInfillLength += infillLength;
				}
			}

			//skip the "; infill" identifier
			if(!infillBeginsMatched){
				layersInfo[layerIndex].S3DInfill += line + "\n";
			}
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
		} else if(slicerIsS3DMatched){
			slicerDetected = true;
			slicer = 'S3D';
			console.log("Slicer: Simplify3D");
		}

		//conditions to detect end of slicer settings
		if(slicerSettingStarted && !slicerSettingMatched){
			slicerSettingParsed = true;
		}

		if(!slicerSettingStarted){
			slicerSettingLinesCount++;
		}

		++slicerSettingsTotalLines;
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
		firstLayerHeight = (layerHeight * firstLayerHeightPercentage / 100).toFixed(3);
		pTower = new PrimeTower({layerHeight, firstLayerHeight});
		
		// for(var i = 0; i < layersInfo.length; i++){

		// 	if(layersInfo[i].toolChangeTotal > 0 && layersInfo[i].S3DInfill != ''){
		// 		console.log(layersInfo[i]);
		// 	}
		// }

		//console.log(pTower.render(true, -85, 0, 0, 0).originXY);

		if(typeof callback === "function"){
			callback();
		}
	});
}

firstPass(processToolchange);
