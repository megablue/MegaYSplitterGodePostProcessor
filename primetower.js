var fs = require("fs");
var fd = fs.openSync('./primetower.gcode', 'w');

var linewidth = 0.48, 
    filamentpermm = (0.01662945).toFixed(5), //.1 layer height
    extrusionMultipler = 1,
    layerheight = 0.2,
    firstlayerheight = 0.2,
    currentlayerheight = firstlayerheight,
    zOffset = 0.1,
    towerwidth = 3.84, //minimum tower width, if the total extrusion length cannot be fulfilled, program will increase the width to accommodate 
    towerlength = 90, //always fulfill the tower length
    bridgelength = 40, //must be always less than the tower length
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
    prime = 9;
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

//offsets
//originX += -85;
//originY += 90;

function primeTower(isFirstLayer, offsetX, offsetY, rotation, infillable_filament_length){

	if(isFirstLayer){
		currentlayerheight = firstlayerheight + zOffset;
		currentlayerspeed = firslayerspeed;
	} else {
		currentlayerspeed = speed;
	}

	fs.appendFileSync(fd, 'G0 F1800 Z' + (currentlayerheight + 1) + "\n");
	drawUntil((originX + towerwidth).toFixed(3), originY, 0, 1800, "init point");

	var filamentToBePurged = minimumPurgeLength - infillable_filament_length,
		x = 0, 
		y = 0, 
		z = currentlayerheight, 
		e = 0, 
		eLength = 0,
		savingMode = false,
		flowRate = 1; 

	if(infillable_filament_length > 0){
		savingMode = true;
	}

	for(;x <= towerwidth || e < filamentToBePurged; x += linewidth){
		if(x==0){
			fs.appendFileSync(fd, 'G1 Z' + z + "\n"); // first layer z height
			fs.appendFileSync(fd, "G1 F1500 E" + prime + "\n"); // prime a little
			fs.appendFileSync(fd, "G92 E0\n"); // zeroing e length.
		}

		if(x==0){
			// console.log("here11");
			// fs.appendFileSync(fd, ";here11\n");
		    console.log("E length: " + eLength + ", Absolute E: " + e.toFixed(5));
			var drawX = ((x + originX + towerwidth - linewidth).toFixed(3)),
				drawY = ((y + originY).toFixed(3)),
				drawE = (e).toFixed(5);
				drawUntil(drawX, drawY, drawE, currentlayerspeed, "set starting point");
			e += getExtrusionLength(towerwidth);	
		}

		if(x==linewidth){
			// console.log("here");
			// fs.appendFileSync(fd, ";Here\n");
			e += getExtrusionLength(towerwidth);
		    console.log("E length: " + eLength + ", Absolute E: " + e.toFixed(5));
			var drawX = ((x + originX + towerwidth - linewidth - linewidth).toFixed(3)),
				drawY = ((y + originY + towerlength).toFixed(3)),
				drawE = (e).toFixed(5);
				drawUntil(drawX, drawY, drawE, currentlayerspeed, "draw second outline");
				drawUntil(drawX-towerwidth, drawY, drawE, currentlayerspeed);
				e += getExtrusionLength(towerlength);
		}

		var gotoX = ((x + originX).toFixed(3)),
		    gotoY = ((y + originY).toFixed(3)),
		    gotoE =  (e).toFixed(5);

		drawUntil(gotoX, gotoY, gotoE, currentlayerspeed);

		e += getExtrusionLength(towerlength);
		console.log("E length: " + eLength + ", Absolute E: " + e.toFixed(5));

		var drawX = ((x + originX).toFixed(3)),
			drawY = ((y + originY + towerlength).toFixed(3)),
			drawE = (e).toFixed(5);
		drawUntil(drawX, drawY, drawE, currentlayerspeed);

	// console.log("X: " + (x).toFixed(5) * 1);
	// console.log("towerwidth: " +  towerwidth);
	// console.log("linewidth: " +  linewidth);
	// console.log("x  == towerwidth - linewidth: " +  Math.floor(towerwidth - linewidth));

		if(e > filamentToBePurged && Math.floor(x) >= Math.floor(towerwidth - linewidth)){
			console.log("end");
			drawX = drawX * 1;
			drawE = drawE * 1;
			drawUntil( drawX + linewidth - towerwidth, drawY,  drawE + retraction, currentlayerspeed);
			drawUntil( drawX, drawY,  drawE + retraction, currentlayerspeed);
			drawUntil( drawX + linewidth - towerwidth, drawY,  drawE + retraction, currentlayerspeed);
		}
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
		eLength = ((filamentpermm * currentlayerheight / 0.1 * distance * extrusionMultipler).toFixed(5)) * 1;
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

primeTower(isFirstLayer, -85, 0, 0, 15);
//primeTower(0,  85, 90, 0);


