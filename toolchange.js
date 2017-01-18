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

function gatherInformation(){
	var lr = new LineByLineReader(filename);
		startupGcodeMarker = /^;end of startup gcode$/i,
		slicerSettingMarker = /^;\s{3}(\w+),(.*)/,
		slicerSettingLinesCount = 0,
		slicerSettingLinesLimit = 200,
		slicerSettingStarted = false,
		slicerSettingParsed = false,
		toolChangeMarker = /^T(\d+)$/,
		layerChangeMarker = /^;.*layer+/i;

	var firstLayerDetected = false,
		numberOfTools = 1,
		toolchangeDetected = false,
		layersInfo = [],
		layerHeight = 0,
		layerHeightDetected = false,
		firstLayerHeightPercentage = 0,
		firstLayerHeightPercentageDetected = false,
		layerIndex = -1;

	var lineProcessGcode = function (line){
		var toolChangeMatched = line.match(toolChangeMarker),
			newLayerMatched = line.match(layerChangeMarker);

		if(toolChangeMatched)

		if(newLayerMatched){

			if(!firstLayerDetected){
				layerIndex = 0;
				firstLayerDetected = true;
			}

			console.log("New layer detected! Layer Count: " + layerIndex);
			layersInfo[layerIndex] = {};
			layerIndex++;
		}
	}

	var lineProcessSlicerSettings = function (line){
		var layerHeightMarker = /^;\s{3}layerHeight,(\d+\.\d+)/;
		firstLayerHeightPercentageMarker = /^;\s{3}firstLayerHeightPercentage\,(\d+\.{0,}\d{0,})/;

		if(!slicerSettingParsed && slicerSettingLinesCount > slicerSettingLinesLimit){
			console.log("Error: unable to determine slicer settings after " + slicerSettingLinesCount + " lines parsed.");
			// probably due the bug in line-by-line, 
			// pause() have to be executed before close() otherwise it will continues to run
			lr.pause(); 
			lr.close();
		}

		var slicerSettingMatched = line.match(slicerSettingMarker);

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

gatherInformation();
//processToolchange();