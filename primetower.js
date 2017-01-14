var fs = require("fs");
var fd = fs.openSync('./primetower.gcode', 'w');

var linewidth = 0.48, 
    filamentpermm = (0.01662945).toFixed(5), //.1 layer height
    extrusionMultipler = 1,
    layerheight = 0.2,
    firstlayerheight = 0.2,
    currentlayerheight = firstlayerheight,
    zOffset = 0.1,
    towerwidth = 4.8, //minimum tower width, if the total extrusion length cannot be fulfilled, program will increase the width to accommodate 
    towerlength = 90, //always fulfill the tower length
    bridges = 3,
    bridgehead = 0.96,
    speed = 3000,
    firslayerspeed = 1200,
    currentlayerspeed = 600,
    centeriszero = true,
    bedXsize = 180,
    bedYsize = 180,
    originX = 0,
    originY = 0,
    centerX = 0,
    centerY = 0,
    retraction = -9,
    retractionspeed = 1800,
    minimumPurgeLength = 30, //based on e3d v6 clone 1.75mm filament
    prime = 9,
    wipe = 3;

if(typeof wipe != 'number' || wipe < 0){
	wipe = 1;
}

var totalBridgeHeads =  bridges + 1,
	bridgeLength = (towerlength - (bridgehead * totalBridgeHeads)) / bridges;
//end of vars
if(centeriszero){
	console.log("Center is zero");
	originX = (-towerwidth / 2);
    originY = (-towerlength / 2);
} else {
	centerX = bedXsize / 2;
	centerY = bedYsize / 2;
	originX = towerwidth / 2;
    originY = towerlength / 2;
	console.log("Center is not zero");
	console.log("x: " + (bedXsize/2));
	console.log("y: " + (bedYsize/2));

	originX = bedXsize/2 - originX;
	originY = bedYsize/2 - originY;
}

function primeTower(isFirstLayer, offsetX, offsetY, rotation, infillableFilamentLength){

	if(isFirstLayer){
		currentlayerheight = (firstlayerheight + zOffset).toFixed(3) * 1;
		currentlayerspeed = firslayerspeed;
	} else {
		currentlayerspeed = speed;
	}

	fs.appendFileSync(fd, 'G0 F1800 Z' + (currentlayerheight + 1) + "\n");
	drawUntil((originX + towerwidth).toFixed(3), originY, 0, 1800, "init point");

	var filamentToBePurged = minimumPurgeLength - infillableFilamentLength,
		x = 0, 
		y = 0, 
		z = currentlayerheight, 
		e = 0, 
		eLength = 0,
		savingMode = false,
		flowRate = 1; 

	console.log("minimum filament to be purged: " + filamentToBePurged);

	if(infillableFilamentLength > 0){
		savingMode = true;
	}

	fs.appendFileSync(fd, 'G1 Z' + z + "\n"); // first layer z height
	fs.appendFileSync(fd, "G1 F1500 E" + prime + "\n"); // prime a little
	fs.appendFileSync(fd, "G92 E0\n"); // zeroing e length.

	var drawX = 0,
		drawY = 0,
		drawE = 0;

	//with saving mode we will generate bridgeheads 
	if(savingMode){
		console.log("savingMode detected");
		for(var i = 0; i < totalBridgeHeads; i++){
			for(var b = 0, c = 0; b <= bridgehead; b += linewidth, c++){
				console.log("E length: " + eLength + ", Absolute E: " + e.toFixed(5));
				drawX = ((originX + towerwidth - linewidth).toFixed(3)),
				drawY = ((c * linewidth + bridgeLength * i + i * bridgehead + originY).toFixed(3)),
				drawE = (e).toFixed(5);
				drawUntil(drawX, drawY, drawE, currentlayerspeed, "b=" + b + ", i=" + i + ", c=" + c);
				e += getExtrusionLength(towerwidth);

				console.log("E length: " + eLength + ", Absolute E: " + e.toFixed(5));
				drawX = ((originX).toFixed(3)),
				drawY = ((c * linewidth + bridgeLength * i + i * bridgehead + originY).toFixed(3)),
				drawE = (e).toFixed(5);
				drawUntil(drawX, drawY, drawE, currentlayerspeed, "b=" + b + ", i=" + i + ", c=" + c);

				if( !(i == totalBridgeHeads - 1 && b == bridgehead - linewidth)){
					e += getExtrusionLength(towerwidth);
				}

				if(b == bridgehead){
					console.log("bridgehead length: " + bridgehead);
				}
			}
		}
	}

	for(var oddity = 0; x <= towerwidth || e < filamentToBePurged; x += linewidth, oddity++){
		if(x==0 && !savingMode){
			// console.log("here11");
			// fs.appendFileSync(fd, ";here11\n");
		    console.log("E length: " + eLength + ", Absolute E: " + e.toFixed(5));
			drawX = ((x + originX + towerwidth - linewidth).toFixed(3)),
			drawY = ((y + originY).toFixed(3)),
			drawE = (e).toFixed(5);
			drawUntil(drawX, drawY, drawE, currentlayerspeed, "set starting point");
			e += getExtrusionLength(towerwidth);	
		}

		if(x==linewidth && !savingMode){
			// console.log("here");
			// fs.appendFileSync(fd, ";Here\n");
			e += getExtrusionLength(towerwidth);
		    console.log("E length: " + eLength + ", Absolute E: " + e.toFixed(5));
			drawX = ((x + originX + towerwidth).toFixed(3)),
			drawY = ((y + originY + towerlength - linewidth).toFixed(3)),
			drawE = (e).toFixed(5);
			drawUntil(drawX - linewidth *2, drawY, drawE, currentlayerspeed, "draw second outline");
			drawUntil(drawX-towerwidth, drawY, drawE, currentlayerspeed);
			e += getExtrusionLength(towerlength);
		}

		if(!savingMode){
			var gotoX = ((x + originX).toFixed(3)),
			    gotoY = ((y + originY).toFixed(3)),
			    gotoE =  (e).toFixed(5);

			drawUntil(gotoX, gotoY, gotoE, currentlayerspeed);

			e += getExtrusionLength(towerlength);
			console.log("E length: " + eLength + ", Absolute E: " + e.toFixed(5));

			drawX = ((x + originX).toFixed(3)),
			drawY = ((y + originY + towerlength - linewidth).toFixed(3)),
			drawE = (e).toFixed(5);
			drawUntil(drawX, drawY, drawE, currentlayerspeed);
		} else{
			if(oddity % 2 == 0){
				for(var i = totalBridgeHeads -1; i > 0; i--){
					drawX = ((x + originX).toFixed(3)),
					drawY = ((bridgeLength * i + bridgehead * i + originY - linewidth/2).toFixed(3)),
					drawE = (e).toFixed(5);
					drawUntil(drawX, drawY, drawE, currentlayerspeed, "reversing start");

					e += getExtrusionLength(bridgeLength + linewidth);

					drawX = ((x + originX).toFixed(3)),
					drawY = ((bridgeLength * (i-1) + bridgehead * (i) + originY - linewidth/2).toFixed(3)),
					drawE = (e).toFixed(5);

					drawUntil(drawX, drawY, drawE, currentlayerspeed, "i =" + i);

					console.log("Reverse E length: " + eLength + ", Absolute E: " + e.toFixed(5));
				}
			} else {
				for(var i = 0; i < totalBridgeHeads - 1; i++){
					drawX = ((x + originX).toFixed(3)),
					drawY = ((bridgeLength * i + bridgehead * (i+1) + originY - linewidth/2).toFixed(3)),
					drawE = (e).toFixed(5);
					drawUntil(drawX, drawY, drawE, currentlayerspeed);

					e += getExtrusionLength(bridgeLength + linewidth);

					drawX = ((x + originX).toFixed(3)),
					drawY = ((bridgeLength * (i+1) + bridgehead * (i+1) + originY + linewidth/2).toFixed(3)),
					drawE = (e).toFixed(5);
					drawUntil(drawX, drawY, drawE, currentlayerspeed, "i =" + i);
					console.log("E length: " + eLength + ", Absolute E: " + e.toFixed(5));
				}
			}
		}

		console.log("e > filamentToBePurged: " + (e > filamentToBePurged));
		console.log("x > (towerwidth - linewidth): " + (x > (towerwidth - linewidth)));
		console.log("x: " + x * 1);
		console.log("(towerwidth - linewidth): " + (towerwidth - linewidth) *1);

		if(e > filamentToBePurged && x *1 >= (towerwidth - linewidth) * 1){
			console.log("end");

			if(isFirstLayer){
				towerwidth = x.toFixed(2) * 1 + linewidth;
				console.log("towerwidth: " + towerwidth);
			}
		}
	}

	drawX = drawX * 1;
	drawE = drawE * 1;

	if(wipe > 1){
		retraction = Math.floor(retraction / wipe);
	}

	for(var w=0; w < wipe; w++){
		console.log('wipe');
		drawUntil( drawX + linewidth - towerwidth, drawY,  drawE + retraction, currentlayerspeed);
		drawUntil( drawX, drawY,  drawE + retraction, currentlayerspeed);
	}

	function drawUntil(x, y, e, speed, comment){
		if(comment && comment.length > 0){
			comment = ';' + comment;
		} else {
			comment = '';
		}

		if(rotation != 0){
			var rotated = rotate(centerX, centerY, x*1,y*1, rotation);
			x = rotated[0].toFixed(3);
			y = rotated[1].toFixed(3);
		}

		x = x * 1 + offsetX;
		y = y * 1 + offsetY;

		fs.appendFileSync(fd, 'G1 F' + speed + ' X' + x + ' Y' + y + ' E' + e + comment + "\n");
	}

	function getExtrusionLength(distance){

		if(isFirstLayer){
			eLength = ((filamentpermm * firstlayerheight / 0.1 * Math.abs(distance) * extrusionMultipler).toFixed(5)) * 1;
		} else {
			eLength = ((filamentpermm * layerheight / 0.1 * Math.abs(distance) * extrusionMultipler).toFixed(5)) * 1;
		}
		
		return eLength;
	}

	function fadeOffset(zOffset){
		var fade = 0.02

		if(zOffset - fade < 0){
			return 0;
		}

		return zOffset - fade;
	}

	function rotate(cx, cy, x, y, angle) {
	    var radians = (Math.PI / 180) * angle,
	        cos = Math.cos(radians),
	        sin = Math.sin(radians),
	        nx = (cos * (x - cx)) + (sin * (y - cy)) + cx,
	        ny = (cos * (y - cy)) - (sin * (x - cx)) + cy;
	    return [nx, ny];
	}
}

var isFirstLayer = true;

// primeTower(isFirstLayer, -85, 0, 0, 0);
// currentlayerheight += layerheight;
// primeTower(!isFirstLayer, 0, 85, 90, 0);

primeTower(isFirstLayer, -85, 0, 0, 0);
currentlayerheight += layerheight;
primeTower(!isFirstLayer, -85, 0, 0, 1);


