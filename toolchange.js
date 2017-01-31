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
    PrimeTower = require('./primetower.js'),
    outputName = filename.split('.gcode')[0] + '_processed.gcode';

var	layersInfo = [],
	pTower = {},
	infillBeginsMarker = /^; infill$/, //S3D specific
	infillStopsMarker = /^; /,    //S3D specific

	layerChangeMarker = /^; layer (\d+), Z = (\d+.\d+)/; //S3D specific
	toolChangeMarker = /^T(\d+)$/,
	slicerSettingsTotalLines = 0,
	layerHeight = 0,
	firstLayerHeightPercentage = 0;

var towerLocations = [];

towerLocations = [
	[xOffset= -85, yOffset = 0, rotation = 0],
	[xOffset=  0, yOffset = 85, rotation = 90]
];

function processToolchange(){
	//var startupTemplate = fs.readFileSync('startup-template.txt').toString();
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

	var currentZ = 0,
		currentLayer = -1,
		currentTool = -1,
		currentTowerIndex = 0,
		maxToolChange = -1,
		currentLine = 0;

	//find out how many prime towers do we need
	maxToolChange = findMaxToolChange();
	console.log("Maximum per layer tool change: " + maxToolChange + ", Total predefined prime towers locations: " + towerLocations.length);

	if(maxToolChange > towerLocations.length){
		console.log("Insufficient predefined tower locations detected. ");

		//console.log(layersInfo);

		process.exit();
	}

	console.log("Settings end at line# " + slicerSettingsTotalLines);
	//process.exit();

	var lr = new LineByLineReader(filename);

	lr.on('line', function (line) {

		if(currentLine++ < slicerSettingsTotalLines){
			console.log(line);
			fs.appendFileSync(fd, line + "\n");
			return;
		}

		var layerChangeMatched = line.match(layerChangeMarker),
			toolChangeMatched = line.match(toolChangeMarker);

		// if(layerChangeMatched){
		// 	if(layerChangeMatched[2] * 1 > currentZ){
		// 		currentZ = layerChangeMatched[2] * 1;
		// 		layerChangeMatched = true;
		// 	} else{
		// 		layerChangeMatched = false;
		// 	}
		// }

		if(layerChangeMatched){
			//if floor are not fully built 
			if(currentLayer >= 0 && currentTowerIndex < maxToolChange){
				for(var i = currentTowerIndex; i < maxToolChange; i++){
					var infillLength = 30,
						isFirstLayer = currentLayer == 0;
					var zHeight = isFirstLayer ? (layerHeight * firstLayerHeightPercentage / 100).toFixed(3) : layerHeight * (currentLayer + 1);
					var tower = pTower.render(isFirstLayer, zHeight, towerLocations[i][0], towerLocations[i][1], towerLocations[i][2], infillLength);
					fs.appendFileSync(fd, tower.gcode + "\n");
				}
			}
			currentZ = layerChangeMatched[2] * 1;
			maxToolChange = findMaxToolChange();
			currentTowerIndex = 0;
			fs.appendFileSync(fd, line + "\n");
			++currentLayer;
		} else if (toolChangeMatched && currentLayer>= 0){
			var oldTool = currentTool < 0 ? toolChangeMatched[1] * 1 : currentTool,
				infillLength = currentLayer > 0 && currentTowerIndex == 0 ? layersInfo[currentLayer].S3DInfillLength : 0,
				isFirstLayer = currentLayer == 0,
				currentTool = toolChangeMatched[1] * 1,
				toolChangeGcode = '',
				tower;
			var zHeight = isFirstLayer ? (layerHeight * firstLayerHeightPercentage / 100).toFixed(3) : ((layerHeight * firstLayerHeightPercentage / 100) + layerHeight * currentLayer).toFixed(3);

			tower = pTower.render(isFirstLayer, zHeight, towerLocations[currentTowerIndex][0], towerLocations[currentTowerIndex][1], towerLocations[currentTowerIndex][2], infillLength);
			toolChangeGcode = renderToolChange(toolchangeTemplate, currentTool, oldTool, tower.originXY[0], tower.originXY[1]);

			fs.appendFileSync(fd, toolChangeGcode + "\n");
			fs.appendFileSync(fd, tower.gcode + "\n");
			//fs.appendFileSync(fd, line + "\n");
			if(currentTowerIndex > 0){
				fs.appendFileSync(fd, ";Something is wrong!!! Line#: " + currentLine + "\n");
				//process.exit();
			}

			++currentTowerIndex;
		} else {
			fs.appendFileSync(fd, line + "\n");
		}

		//fs.appendFileSync(fd, line + "\n");
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

	function renderToolChange(template, newtool, oldtool, x, y){
	    template = template.replace("\r\n", "\n");
	    template = template.replace(/^\s*\n/gm, "\n");
	    template = template.replace('{NEWTOOL}', newtool);
	    template = template.replace('{OLDTOOL}', oldtool);
	    template = template.replace('{X}', x);
	    template = template.replace('{Y}', y);
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
		slicer = '',
		slicerDetected = false,
		startupGcodeMarker = /^;end of startup gcode$/i,
		slicerSettingMarker = /^;\s{3}(\w+),?(.*)/,
		slicerSettingLinesCount = 0,
		slicerSettingLinesLimit = 200,
		slicerSettingStarted = false,
		slicerSettingParsed = false,
		extrudeMarker = /^G1.*E(\d{1,}.{0,1}\d{1,})/;

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
		infillCounted = false,
		currentZ = 0;

	var lineProcessGcode = function (line){
		var toolChangeMatched = line.match(toolChangeMarker),
			newLayerMatched = line.match(layerChangeMarker),
			infillBeginsMatched = slicer == 'S3D' ? line.match(infillBeginsMarker) : false,
			infillStopsMatched  = slicer == 'S3D' ? line.match(infillStopsMarker) : false;

		if(toolChangeMatched && layersInfo[layerIndex]){
			layersInfo[layerIndex].toolChange[layersInfo[layerIndex].toolChangeTotal] =  toolChangeMatched[1] * 1;
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

		if(newLayerMatched){
			// console.log("new layer detected " + newLayerMatched[1] );
			// console.log("new layer z " + newLayerMatched[2] );

			if(infillCounted){
				infillCounted = false;
				infilling = false;

				if(infillLength > 0){
					layersInfo[layerIndex].S3DInfillLength = (infillLength/IMULTIPLIER).toFixed(4);
					//console.log("Layer: " + layerIndex + ", Purge-able Infill length: " + layersInfo[layerIndex].S3DInfillLength + ", Gcode:");
					//console.log(layersInfo[layerIndex].S3DInfill);
				}
			}

			++layerIndex;

			if(!firstLayerDetected){
				firstLayerDetected = true;
			}

			//console.log("New layer detected! Layer Count: " + layerIndex);
			layersInfo[layerIndex] = {toolChange: [], toolChangeTotal: 0, S3DInfillLength: 0, S3DInfill: ''};			
			infillLength = 0;
		}

		if(infillBeginsMatched){
			infilling = true;
		} else if(infillStopsMatched){
			infilling = false;
		}

		if(slicer == 'S3D' && infilling){

			if(layersInfo[layerIndex]){
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
		var firstLayerHeight = (layerHeight * firstLayerHeightPercentage / 100).toFixed(3);
		pTower = new PrimeTower({layerHeight, firstLayerHeight});
		
		// for(var i = 0; i < layersInfo.length; i++){

		// 	if(layersInfo[i].toolChangeTotal > 0 && layersInfo[i].S3DInfill != ''){
		// 		console.log(layersInfo[i]);
		// 	}
		// }

		//console.log(pTower.render(true, -85, 0, 0, 0).originXY);
		callback();
	});
}

firstPass(processToolchange);
