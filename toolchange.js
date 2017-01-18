console.log("Mega YSplitter Gcode Post Processor v1.0");

var args = process.argv.slice(2),
    filename = args.join([separator = ' ']);

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
		layerChangeMarker = /^;.*layer+/i,
		layerHeightMarker = /^;\s{3}layerHeight,(\d+\.\d+)/;

	var firstLayerDetected = false,
		numberOfTools = 1,
		layersInfo = {},
		layerHeight = 0.2,
		layerHeightDetected = false,
		layerCounter = 0;

	lr.on('line', function (line) {
		var newLayerMatched = line.match(layerChangeMarker),
			layerHeightMatched = !layerHeightDetected ? line.match(layerHeightMarker) : false;

		if(layerHeightMatched){
			console.log("layerHeight: " + layerHeightMatched[1]);
			layerHeight = layerHeightMatched[1];
			layerHeightDetected = true;
		}

		if(newLayerMatched){

			if(!firstLayerDetected){
				firstLayerDetected = true;
				console.log("First layer detected! Layer Count: " + layerCounter);
			} else {
				//console.log("New layer detected! Layer Count: " + layerCounter);
			}

			++layerCounter;
		}
	});

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