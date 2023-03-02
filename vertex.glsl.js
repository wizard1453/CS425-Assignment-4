export default `#version 300 es

uniform mat4 uModel;
uniform mat4 uProjection;
uniform mat4 uView;
uniform vec4 uColor;
uniform bool uHasNormals;

in vec3 position;
in vec3 normal;

out vec4 vColor;

void main() {
    if(uHasNormals) {
        // TODO shade according to normal
        vColor = vec4(uColor.rgb,1);
    }
    else {
        vColor = vec4(uColor.rgb,1);
    }

    gl_Position = uProjection * uView * uModel * vec4(position, 1);
}
`;