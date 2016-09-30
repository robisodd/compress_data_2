'use strict';  // jshint ignore:line
var Zlib = require('zlib');

// ------------------------------------------------------------------------------------------------------------------------------------------------ //
//  Constants
// ------------------------------
const COLORTYPE_GREYSCALE   = 0;  // bitdepth: 1, 2, 4, 8, 16  Each pixel is a greyscale sample
const COLORTYPE_COLOR       = 2;  // bitdepth:          8, 16  Each pixel is an R,G,B triple
const COLORTYPE_INDEXED     = 3;  // bitdepth: 1, 2, 4, 8      Each pixel is a palette index; a PLTE chunk shall appear.
const COLORTYPE_GREY_ALPHA  = 4;  // bitdepth:          8, 16  Each pixel is a greyscale sample followed by an alpha sample.
const COLORTYPE_COLOR_ALPHA = 6;  // bitdepth:          8, 16  Each pixel is an R,G,B triple followed by an alpha sample.

const COMPRESSION_DEFLATE   = 0;

const FILTERING_ADAPTIVE    = 0;

const INTERLACE_NONE        = 0;
const INTERLACE_ADAM7       = 1;



// ------------------------------------------------------------------------------------------------------------------------------------------------ //
// Generate CRC Table and Calculate CRC
// https://www.w3.org/TR/PNG/#D-CRCAppendix
// ------------------------------
var crc_table = [];
for (var n = 0; n < 256; n++) {
  var c = n;
  for (var k = 0; k < 8; k++)
    if (c & 1)
      c = 0xedb88320 ^ (c >>> 1);
    else
      c = c >>> 1;
  crc_table[n] = c;
}

function crc(buf) {
  var c = 0xffffffff;
  for (var n = 0; n < buf.length; n++)
    c = crc_table[(c ^ buf[n]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}


function dword(dword) {
  return [(dword >>> 24) & 0xFF,
          (dword >>> 16) & 0xFF,
          (dword >>>  8) & 0xFF,
          (dword       ) & 0xFF];
}


function create_chunk(type, data) {
  return Array.prototype.concat(dword(data.length), type, data, dword(crc(type.concat(data))));
}


function create_header(width, height, bit_depth) {
  return Array.prototype.concat(dword(width),
                   dword(height),
                   [bit_depth,
                    COLORTYPE_GREYSCALE,
                    COMPRESSION_DEFLATE,
                    FILTERING_ADAPTIVE,
                    INTERLACE_NONE]
                  );
}



var w, h;
function parse_data(data) {
  w = data.length; h = 1;
  if(w < 2000) {  // 2000 bytes @ 8 pixels / bit = 16000px wide image.  *Almost* too big for Pebble.
    console.log("Size already small enough: (" + w + "w x " + h + "h)");
    return [0].concat(data);  // 0 = No Filter
  }
  
  // Double the height and halve the width until width is within Pebble limits
  while (w>=2000) {
    h *= 2;
    w = Math.ceil(w / 2);
  }
  console.log("New dimensions: (" + w + "w x " + h + "h)");
  
  // Rebuild array with filter 0's and padding final bytes
  var arr = [], x, y, pos = 0;
  for (y = 0; y < h; ++y)
    for (arr.push(0), x = 0; x < w; ++x, ++pos)    // push 0 = No Filter.  Needs to be at the beginning of every row
      arr.push((pos>data.length) ? 0 : data[pos]); // If we're out of data, pad with 0's
  return arr;
}


// Spec from: https://www.w3.org/TR/PNG/
// data should be an array of bytes
function generate(data) {
  var compressed_array = new Zlib.Deflate(parse_data(data)).compress();
  var compressed_data = Array.prototype.slice.call(compressed_array);  // Convert TypedArray to standard JS array
  //console.log("Size before / after compression: " + data.length + " / " + compressed_data.length);
  
  var SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];           // PNG Signature
  //var IHDR_data = create_header(compressed_data.length*8, 1, 1); // PNG Header (no parse_data)
  var IHDR_data = create_header(w*8, h, 1);                    // PNG Header
  var IHDR = create_chunk([73, 72, 68, 82], IHDR_data);        // PNG Header
  var IDAT = create_chunk([73, 68, 65, 84], compressed_data);  // PNG Compressed Data
  var IEND = create_chunk([73, 69, 78, 68], []);               // PNG End
  return Array.prototype.concat(SIGNATURE, IHDR, IDAT, IEND);  // Return PNG in a byte array
}




exports.generate = generate;
