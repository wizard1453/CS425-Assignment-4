import vertexSrc from './vertex.glsl.js';
import fragmentSrc from './fragment.glsl.js';
import shadowFragShaderSrc from './shadowFrag.glsl.js';
import shadowVertShaderSrc from './shadowVert.glsl.js';
import depthFragShaderSrc from './depthFrag.glsl.js';
import depthVertShaderSrc from './depthVert.glsl.js';

var gl;

var layers = null

var modelMatrix;
var projectionMatrix;
var viewMatrix;
var lightProjectionMatrix = identityMatrix();
var lightViewMatrix = identityMatrix();

var currRotate = 0;
var currLightRotate = 0;
var currZoom = 0;
var currProj = 'perspective';

var renderToScreen = null;
var fbo = null;

var currResolution = 2048;
var displayShadowmap = false;

var curR = 0;
var prev_r = 0;
var prev_rlight = 0;

/*
    FBO
*/
class FBO {
    constructor(size) {
        // TODO: Create FBO and texture with size
        this.texture = createTexture2D(gl, size, size, gl.DEPTH_COMPONENT32F, 0, gl.DEPTH_COMPONENT, gl.FLOAT, null, gl.NEAREST, gl.NEAREST, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE);
        this.fbo = createFBO(gl, gl.DEPTH_ATTACHMENT, this.texture);
        this.size = size;
    }

    start() {
        // TODO: Bind FBO, set viewport to size, clear depth buffer
        gl.viewport(0, 0, this.size, this.size);

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.clear(gl.DEPTH_BUFFER_BIT);
    }

    stop() {
        // TODO: unbind FBO
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
}

/*
    Shadow map
*/
class ShadowMapProgram {
    constructor() {
        this.vertexShader = createShader(gl, gl.VERTEX_SHADER, shadowVertShaderSrc);
        this.fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, shadowFragShaderSrc);
        this.program = createProgram(gl, this.vertexShader, this.fragmentShader);

        this.posAttribLoc = gl.getAttribLocation(this.program, "position");
        this.colorAttribLoc = gl.getUniformLocation(this.program, "uColor");
        this.modelLoc = gl.getUniformLocation(this.program, "uModel");
        this.projectionLoc = gl.getUniformLocation(this.program, "uProjection");
        this.viewLoc = gl.getUniformLocation(this.program, "uView");
        this.lightViewLoc = gl.getUniformLocation(this.program, "uLightView");
        this.lightProjectionLoc = gl.getUniformLocation(this.program, "uLightProjection");
        this.samplerLoc = gl.getUniformLocation(this.program, "uSampler");
        this.hasNormalsAttribLoc = gl.getUniformLocation(this.program, "uHasNormals");
        this.lightDirAttribLoc = gl.getUniformLocation(this.program, "uLightDir");
    }

    use() {
        // TODO: use program
        gl.useProgram(this.program);
    }
}

/*
    Render to screen program
*/
class RenderToScreenProgram {
    constructor() {
        this.vertexShader = createShader(gl, gl.VERTEX_SHADER, depthVertShaderSrc);
        this.fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, depthFragShaderSrc);

        this.program = createProgram(gl, this.vertexShader, this.fragmentShader);
        this.posAttribLoc = gl.getAttribLocation(this.program, "position");
        this.samplerLoc = gl.getUniformLocation(this.program, "uSampler");

        // TODO: Create quad VBO and VAO
        // A initial quad consists of two triangles
        this.vert = [-1, -1, 0, 1, -1, 0, 1, 1, 0, 1, 1, 0, -1, -1, 0, -1, 1, 0];
        this.vertexBuffer = createBuffer(gl, gl.ARRAY_BUFFER, new Float32Array(this.vert));
        this.vao = createVAO(gl, this.posAttribLoc, this.vertexBuffer);
    }

    draw(texture) {
        // TODO: Render quad and display texture
        gl.useProgram(this.program);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(this.samplerLoc, 0);
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
}

/*
    Vertex shader with uniform colors
*/
class LayerProgram {
    constructor() {
        this.vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSrc);
        this.fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSrc);
        this.program = createProgram(gl, this.vertexShader, this.fragmentShader);

        this.posAttribLoc = gl.getAttribLocation(this.program, "position");
        this.colorAttribLoc = gl.getUniformLocation(this.program, "uColor");
        this.modelLoc = gl.getUniformLocation(this.program, "uModel");
        this.projectionLoc = gl.getUniformLocation(this.program, "uProjection");
        this.viewLoc = gl.getUniformLocation(this.program, "uView");
        this.hasNormalsAttribLoc = gl.getUniformLocation(this.program, "uHasNormals");
    }

    use() {
        gl.useProgram(this.program);
    }
}


/*
    Collection of layers
*/
class Layers {
    constructor() {
        this.layers = {};
        this.centroid = [0,0,0];
    }

    addLayer(name, vertices, indices, color, normals) {
        if(normals == undefined)
            normals = null;
        var layer = new Layer(vertices, indices, color, normals);
        layer.init();
        this.layers[name] = layer;
        this.centroid = this.getCentroid();
    }

    removeLayer(name) {
        delete this.layers[name];
    }

    // draw() {
    //     for(var layer in this.layers) {
    //         this.layers[layer].draw(this.centroid);
    //     }
    // }

    draw(modelMatrix, viewMatrix, projectionMatrix, lightViewMatrix = null, lightProjectionMatrix = null, shadowPass = false, texture = null) {
        for (var layer in this.layers) {
            if (layer == 'surface') {
                gl.polygonOffset(1, 1);
            }
            else {
                gl.polygonOffset(0, 0);
            }
            this.layers[layer].draw(modelMatrix, viewMatrix, projectionMatrix, lightViewMatrix, lightProjectionMatrix, shadowPass, texture);
        }
    }

    
    getCentroid() {
        var sum = [0,0,0];
        var numpts = 0;
        for(var layer in this.layers) {
            numpts += this.layers[layer].vertices.length/3;
            for(var i=0; i<this.layers[layer].vertices.length; i+=3) {
                var x = this.layers[layer].vertices[i];
                var y = this.layers[layer].vertices[i+1];
                var z = this.layers[layer].vertices[i+2];
    
                sum[0]+=x;
                sum[1]+=y;
                sum[2]+=z;
            }
        }
        return [sum[0]/numpts,sum[1]/numpts,sum[2]/numpts];
    }
}

/*
    Layers without normals (water, parks, surface)
*/
class Layer {
    constructor(vertices, indices, color, normals = null) {
        this.vertices = vertices;
        this.indices = indices;
        this.color = color;
        this.normals = normals;

        this.hasNormals = false;
        if(this.normals) {
            this.hasNormals = true;
        }
    }

    init() {
        this.layerProgram = new LayerProgram();
        this.shadowProgram = new ShadowMapProgram();

        this.vertexBuffer = createBuffer(gl, gl.ARRAY_BUFFER, new Float32Array(this.vertices));
        this.indexBuffer = createBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(this.indices));

        if(this.normals) {
            this.normalBuffer = createBuffer(gl, gl.ARRAY_BUFFER, new Float32Array(this.normals));
            this.vao = createVAO(gl, 0, this.vertexBuffer, 1, this.normalBuffer);
        }
        else {
            this.vao = createVAO(gl, 0, this.vertexBuffer);
        }
    }

    // draw(centroid) {
    //     this.layerProgram.use();

    //     updateModelMatrix(centroid);
    //     gl.uniformMatrix4fv(this.layerProgram.modelLoc, false, new Float32Array(modelMatrix));
    
    //     updateProjectionMatrix();
    //     gl.uniformMatrix4fv(this.layerProgram.projectionLoc, false, new Float32Array(projectionMatrix));
    
    //     updateViewMatrix(centroid);
    //     gl.uniformMatrix4fv(this.layerProgram.viewLoc, false, new Float32Array(viewMatrix));

    //     // possible solution
    //     gl.uniform4fv(this.layerProgram.colorAttribLoc, new Float32Array(this.color));
    //     gl.uniform1i(this.layerProgram.hasNormalsAttribLoc, this.hasNormals);

    //     gl.bindVertexArray(this.vao);
    //     gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    //     // console.log(this.indices.length);
    //     gl.drawElements(gl.TRIANGLES, this.indices.length, gl.UNSIGNED_INT, 0);
    // }

    draw(modelMatrix, viewMatrix, projectionMatrix, lightViewMatrix, lightProjectionMatrix, shadowPass = false, texture = null) {
        // TODO: Handle shadow pass (using ShadowMapProgram) and regular pass (using LayerProgram)
        // shadowPass --> true use lightProjectionMatrix
        //            --> false use normal matrix, regular viewmatrix
        if (!shadowPass) {
            this.layerProgram.use();
            gl.uniformMatrix4fv(this.layerProgram.modelLoc, false, new Float32Array(modelMatrix));
            gl.uniformMatrix4fv(this.layerProgram.projectionLoc, false, new Float32Array(lightProjectionMatrix));
            gl.uniformMatrix4fv(this.layerProgram.viewLoc, false, new Float32Array(lightViewMatrix));
            gl.uniform4fv(this.layerProgram.colorAttribLoc, this.color);
        } else {
            this.shadowProgram.use();

            gl.uniform1i(this.shadowProgram.hasNormalsAttribLoc, this.hasNormals);

            gl.uniformMatrix4fv(this.shadowProgram.modelLoc, false, new Float32Array(modelMatrix))
            gl.uniformMatrix4fv(this.shadowProgram.projectionLoc, false, new Float32Array(projectionMatrix))
            gl.uniformMatrix4fv(this.shadowProgram.viewLoc, false, new Float32Array(viewMatrix));
            gl.uniformMatrix4fv(this.shadowProgram.lightProjectionLoc, false, new Float32Array(lightProjectionMatrix));
            gl.uniformMatrix4fv(this.shadowProgram.lightViewLoc, false, new Float32Array(lightViewMatrix));

            gl.uniform4fv(this.shadowProgram.colorAttribLoc, this.color);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texture);

            gl.uniform1i(this.shadowProgram.samplerLoc, 0);
        }

        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.drawElements(gl.TRIANGLES, this.indices.length, gl.UNSIGNED_INT, 0);
    }
}


/*
    Event handlers
*/
window.updateRotate = function() {
    currRotate = parseInt(document.querySelector("#rotate").value);

    if (!displayShadowmap) {
        curR = curR + (currRotate - prev_r);
        prev_r = currRotate;
    }
}

window.updateLightRotate = function () {
    currLightRotate = parseInt(document.querySelector("#lightRotate").value);

    curR = curR + (currLightRotate - prev_rlight);
    prev_rlight = currLightRotate;
}

window.updateZoom = function() {
    currZoom = parseFloat(document.querySelector("#zoom").value);
}

window.updateProjection = function() {
    currProj = document.querySelector("#projection").value;
}

/*
    File handler
*/

var coordinates = []
var indices = [];
var normals = [];

function createBuilding(centerX, centerY, size, height, curIndex) {

    // Task 3 Add some noises.
    var r1 = Math.random() + 0.3;
    // console.log(r1);
    var r2 = Math.random()*2-1;
    // console.log(r2);

    size = size * r1;
    // size = size * (1 + r1/10);
    height = height * (1 + r2/10);
    // Use this if you choose example 1.
    // if(height<98) height = 0;
    // Use this if you choose example 2 or 3.
    if(height<50) height = 0;

    // TODO create faces of the building taking into account center point, size and height
    // +z
    coordinates.push(...[centerX-size/2.0, centerY-size/2.0, height, 
                        centerX+size/2.0, centerY-size/2.0, height, 
                        centerX+size/2.0, centerY+size/2.0, height, 
                        centerX-size/2.0,centerY+size/2.0, height ]);
    // -z
    // coordinates.push(...[centerX-size/2.0, centerY-size/2.0, -10, 
    //                     centerX-size/2.0, centerY+size/2.0, -10, 
    //                     centerX+size/2.0, centerY+size/2.0, -10,  
    //                     centerX+size/2.0,centerY-size/2.0, -10 ]);
    // +y
    coordinates.push(...[centerX-size/2.0, centerY+size/2.0, 0, 
                        centerX-size/2.0, centerY+size/2.0, height, 
                        centerX+size/2.0, centerY+size/2.0, height, 
                        centerX+size/2.0,centerY+size/2.0, 0 ]);
    // -y
    coordinates.push(...[centerX-size/2.0, centerY-size/2.0, 0, 
                        centerX+size/2.0, centerY-size/2.0, 0, 
                        centerX+size/2.0, centerY-size/2.0, height, 
                        centerX-size/2.0,centerY-size/2.0, height ]);
    // +x
    coordinates.push(...[centerX+size/2.0, centerY-size/2.0, 0, 
                        centerX+size/2.0, centerY+size/2.0, 0, 
                        centerX+size/2.0, centerY+size/2.0, height, 
                        centerX+size/2.0,centerY-size/2.0, height ]);
    // -x
    coordinates.push(...[centerX-size/2.0, centerY-size/2.0, 0, 
                        centerX-size/2.0, centerY-size/2.0, height, 
                        centerX-size/2.0, centerY+size/2.0, height, 
                        centerX-size/2.0,centerY+size/2.0, 0 ]);
    // Task2 compute normals
    normals.push(...[0,0,1, 0,0,1, 0,0,1, 0,0,1]);
    // normals.push(...[0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1]);
    normals.push(...[0,1,0, 0,1,0, 0,1,0, 0,1,0]);
    normals.push(...[0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0]);
    normals.push(...[1,0,0, 1,0,0, 1,0,0, 1,0,0]);
    normals.push(...[-1,0,0, -1,0,0, -1,0,0, -1,0,0]);

    if(height==0) {
        indices.push(...[curIndex+0, curIndex+2, curIndex+1, curIndex+0, curIndex+3, curIndex+2]);
    } else indices.push(...[curIndex+0, curIndex+1, curIndex+2, curIndex+0, curIndex+2, curIndex+3]);
    indices.push(...[curIndex+4, curIndex+5, curIndex+6, curIndex+4, curIndex+6, curIndex+7]);
    indices.push(...[curIndex+8, curIndex+9, curIndex+10, curIndex+8, curIndex+10, curIndex+11]);
    indices.push(...[curIndex+12, curIndex+13, curIndex+14, curIndex+12, curIndex+14, curIndex+15]);
    indices.push(...[curIndex+16, curIndex+17, curIndex+18, curIndex+16, curIndex+18, curIndex+19]);
    // indices.push(...[curIndex+20, curIndex+21, curIndex+22, curIndex+20, curIndex+22, curIndex+23]);

    // return {'coordinates': coordinates, 'indices': indices, 'normals': normals};
}

function buildGeometries(imgArray, width, height) {

    var geometries = {'surface': {'coordinates': [], 'indices': [], 'color': [0.9333333333333333, 0.9333333333333333, 0.9333333333333333, 1.0]},
                      'buildings': {'coordinates': [], 'indices': [], 'normals': [], 'color': [0.5, 0.6, 0.9, 1.0]}};

    // TODO loop through array and create building geometry according to red channel value
    var maxHeight = 500;
    var cellsize = 100;
    var buildingsize = 75;
    var curIndex = 0;

    // console.log(width);
    // console.log(height);

    var i = 0;
    var j = 0;

    while(curIndex<imgArray.length) {

        // console.log(i);
        // console.log(j);
        var cX = j*cellsize+cellsize/2-width*cellsize/2;
        var cY = i*cellsize+cellsize/2-height*cellsize/2;

        createBuilding(cX, cY, buildingsize, imgArray[curIndex]/255 * maxHeight, curIndex*5);
        // console.log(imgArray[curIndex]);

        if(++j==width) {
            j=0;
            i++;
        }

        curIndex+=4;
    }

    geometries['buildings'] = {'coordinates': coordinates, 'indices': indices, 'normals': normals ,'color': [0.5, 0.6, 0.9, 1.0]};
    console.log(geometries['buildings']);


    // Surface
    geometries['surface']['coordinates'] = [-width*cellsize/2.0,-height*cellsize/2.0,0,  width*cellsize/2.0,-height*cellsize/2.0,0, width*cellsize/2.0,height*cellsize/2.0,0, -width*cellsize/2.0,height*cellsize/2.0,0 ];
    // console.log(geometries['surface']['coordinates']);
    geometries['surface']['indices'] = [0, 1, 2, 0, 2, 3];
    // console.log(geometries['surface']['indices']);

    return geometries;
}

window.handleFile = function(e) {
    var img = new Image();
    img.onload = function() {
        var context = document.getElementById('image').getContext('2d');
        context.drawImage(img, 0, 0);
        var data = context.getImageData(0, 0, img.width, img.height).data;
        var geometries = buildGeometries(data, img.width, img.height);
        layers.addLayer('surface', geometries['surface']['coordinates'], geometries['surface']['indices'], geometries['surface']['color']);
        layers.addLayer('buildings', geometries['buildings']['coordinates'], geometries['buildings']['indices'], geometries['buildings']['color'], geometries['buildings']['normals']);
    };
    img.src = URL.createObjectURL(e.files[0]);
}

/*
    Update transformation matrices
*/

function updateProjectionMatrix() {
    var aspect = window.innerWidth / window.innerHeight;
    if (currProj == 'perspective') {
        // projectionMatrix = perspectiveMatrix(45.0 * Math.PI / 180.0, aspect, 0, 30000);
        /*Why doesn't it work when the near is set to 0? --> in function perspectiveMatrix there is a number that is multipled by near*/
        projectionMatrix = perspectiveMatrix(30.0 * Math.PI / 180.0, aspect, 1, 50000);
    } else {
        var maxZoom = 5000;
        // var zoom = currZoom/100*maxZoom;
        var zoom = maxZoom - (currZoom / 100) * maxZoom;
        projectionMatrix = orthographicMatrix(-aspect * zoom, aspect * zoom, -zoom, zoom, -1, 50000);
    }
}

/*
    Update transformation matrices
*/
function updateModelMatrix(centroid) {
    var rotateZ = rotateZMatrix((currRotate) * Math.PI / 180.0);

    var position = translateMatrix(centroid[0], centroid[1], centroid[2]);
    var scale = translateMatrix(-centroid[0], -centroid[1], -centroid[2]);

    if (!displayShadowmap) {
        modelMatrix = multiplyArrayOfMatrices([
            position,
            rotateZ,
            scale
        ]);
    }
    else {
        modelMatrix = identityMatrix();
    }
}

window.displayShadowmap = function (e) {
    displayShadowmap = e.checked;
}

function updateViewMatrix(centroid){
    // TIP: use lookat function
    var maxZoom = 5000;
    // var zoom = maxZoom - (currZoom / 100.0) * maxZoom;
    var zoom = maxZoom - (currZoom / 100.0) * maxZoom + 5000;
    var eye = add(centroid, [zoom, zoom, zoom]);

    var camera = lookAt(eye, centroid, [0, 0, 1]);
    var position = translateMatrix(0, 0, -zoom);

    viewMatrix = multiplyArrayOfMatrices([
        position,
        camera
    ]);
}

function updateLightViewMatrix(centroid) {
    // TODO: Light view matrix
    // var lightViewMatrix = identityMatrix();
    // return lightViewMatrix;

    if (!displayShadowmap) {
        var x = 5000 * Math.cos((curR) * Math.PI / 180.0);
        var y = 5000 * Math.sin((curR) * Math.PI / 180.0);
        var camera = lookAt(add(centroid, [-x, y, 5000]), centroid, [0, 0, 1]);
    }
    else {
        var x = 5000 * Math.cos(curR * Math.PI / 180.0);
        var y = 5000 * Math.sin(curR * Math.PI / 180.0);
        var camera = lookAt(add(centroid, [x, y, 5000]), centroid, [0, 0, 1]);
    }

    lightViewMatrix = camera;
}

function updateLightProjectionMatrix() {
    // TODO: Light projection matrix
    // var lightProjectionMatrix = identityMatrix();
    // return lightProjectionMatrix;

    if (!displayShadowmap) {
        var maxzoom = 6000;
        lightProjectionMatrix = orthographicMatrix(-1 * maxzoom, 1 * maxzoom, -1 * maxzoom, 1 * maxzoom, -1, 20000);
    }
    else {
        var maxzoom = 6000;
        lightProjectionMatrix = orthographicMatrix(-1 * maxzoom, 1 * maxzoom, -1 * maxzoom, 1 * maxzoom, -1, 20000);
    }
}

/*
    Main draw function (should call layers.draw)
*/
function draw() {

    gl.clearColor(190/255, 210/255, 215/255, 1);
    gl.clearDepth(1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    fbo.start();
    updateModelMatrix(layers.centroid);
    updateProjectionMatrix();
    updateViewMatrix(layers.centroid);
    updateLightViewMatrix(layers.centroid);
    updateLightProjectionMatrix();

    // gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    // layers.draw();

    layers.draw(modelMatrix, viewMatrix, projectionMatrix, lightViewMatrix, lightProjectionMatrix, false, null);
    fbo.stop();

    if (!displayShadowmap) {
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        // TODO: Second rendering pass, render to screen
        layers.draw(modelMatrix, viewMatrix, projectionMatrix, lightViewMatrix, lightProjectionMatrix, true, fbo.texture);
    }
    else {
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        // TODO: Render shadowmap texture computed in first pass
        renderToScreen.draw(fbo.texture);
    }

    requestAnimationFrame(draw);
}

/*
    Initialize everything
*/
function initialize() {

    var canvas = document.querySelector("#glcanvas");
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    gl = canvas.getContext("webgl2");

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);

    layers = new Layers();
    fbo = new FBO(currResolution);
    renderToScreen = new RenderToScreenProgram();

    window.requestAnimationFrame(draw);

}


window.onload = initialize;