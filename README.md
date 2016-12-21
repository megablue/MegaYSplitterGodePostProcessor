# MegaYSplitterGodePostProcessor
It is a FDM gcode post processor designed to improved multi materials printing with a Y splitter (such as Prometheus and Prusa i3 MK2 Multi materials printing kit) 

It is highly experimental, currently only work with gcode rendered by Simplify3D. You need to insert to proper markers into the toolchange section of your S3D settings in order for the script to work.

*Installation*
npm install line-by-line

*Execute*
node toolchange.js yourgcodefile.gcode
