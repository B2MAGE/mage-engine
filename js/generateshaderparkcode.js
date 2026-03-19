// import { 

// } from '';


export function generateshaderparkcode(shader)  {
    // Put your Shader Park Code here
    if (shader == 'default') 
    {
      return `
      let size = input()
      let pointerDown = input()
      time = .3*time
	  size *= 1.3
      rotateY(mouse.x * -2 * PI / 2 * (1+nsin(time)))
      rotateX(mouse.y * 2 * PI / 2 * (1+nsin(time)))
      metal(.5*size)
      let rayDir = normalize(getRayDirection())
      let clampedColor = vec3(rayDir.x+.2, rayDir.y+.25, rayDir.z+.2)
      color(clampedColor)

      rotateY(sin(getRayDirection().y*8*(ncos(sin(time)))+size))
	  rotateX(cos((getRayDirection().x*16*nsin(time)+size)))
	  rotateZ(ncos((getRayDirection().z*4*cos(time)+size)))
      boxFrame(vec3(size), size*.1)
      shine(0.8*size)
      blend(nsin(time*(size))*0.1+0.1)
      sphere(size/2-pointerDown*.3)
      blend(ncos((time*(size)))*0.1+0.1)
      boxFrame(vec3(size-.075*pointerDown), size)
      `
    } else if (shader == 'dev') {
          return `
          let size = input()
          let pointerDown = input()
          time = .3*time
        size *= 1.3
          rotateY(mouse.x * -2 * PI / 2 * (1+nsin(time)))
          rotateX(mouse.y * 2 * PI / 2 * (1+nsin(time)))
          metal(.5*size)
          let rayDir = normalize(getRayDirection())
      let clampedColor = vec3(max(0.0, min(rayDir.x + 0.2, 100.0)), max(0.0, min(rayDir.y + 0.2, 100.0)), max(0.0, min(rayDir.z + 0.2, 100.0)))
      color(clampedColor)
    
          rotateY(sin(getRayDirection().y*8*(ncos(sin(time)))+size))
        rotateX(cos((getRayDirection().x*16*nsin(time)+size)))
        rotateZ(ncos((getRayDirection().z*4*cos(time)+size)))
          boxFrame(vec3(size), size*.1)
          shine(0.8*size)
          blend(nsin(time*(size))*0.1+0.1)
          sphere(size/2-pointerDown*.3)
          blend(ncos((time*(size)))*0.1+0.1)
          boxFrame(vec3(size-.075*pointerDown), size)
          `
    } else if (shader == 'og')
      {
      return `
      let size = input()
      let pointerDown = input()
      
      rotateY(mouse.x * -4 * PI / 2 + time + size * .10 -(pointerDown+0.1))
      rotateX(mouse.y * 4 * PI / 2 + time + size * .10 )
      metal(.5)
      color(normalize(getRayDirection())+.2)
      rotateY(getRayDirection().y*6+size)
      boxFrame(vec3(size), size)
      shine(.4)
      expand(-.02*size+.02)
      blend(nsin((time*(size+1)))*0.1+0.1)
      sphere(size/2-pointerDown*.3)
      blend(ncos((time*(size+1)))*0.1+0.1)
      boxFrame(vec3(size-pointerDown), size-pointerDown)
      `;
    } else if (shader == 'test') { 
      return `
        let size = input()
      let pointerDown = input()
        let march = glslFunc(\`
          struct Ray {
          vec3 origin;
          vec3 direction;
        };
            
        struct Sphere {
            vec3 position;
            float radius;
        };

        struct Plane {
          vec3 normal;
            float offset;
        };
            
        struct FarLight {
          vec3 direction;
            vec4 color;
        };        

        struct PointLight {
          vec3 position;
            vec4 color;
        };

        const vec4 ambient = vec4(0.1,0.05,0.07,1.0);
        const vec4 planeColor = vec4( 0.64, 0.68, 0.55, 1.0);
        const vec4 sphereColor = vec4( 0.84, 0.93, 0.07, 1.0);
            
        Plane p1 = Plane(vec3(0.0,1.0,0.0), 1.5);

        vec3 repeat( vec3 v ) {
            return vec3(mod(v.x,4.0)-2.0, v.y, mod(v.z,10.0));   
        }
            
        float distFromSphere(Sphere s, vec3 p) {
          return distance(repeat(p),s.position)-s.radius;  
        }

        float distFromPlane(Plane plane, vec3 p) {
          return dot(plane.normal, p) + plane.offset;
        }

        vec3 mainImage(vec3 rayDir, float iTime) {
            
            FarLight sun = FarLight(normalize(vec3(sin(iTime),0.4,cos(0.43*iTime))), vec4(1.0,0.8,0.75,1.0));

            Sphere sphere1 = Sphere(vec3(0.0,cos(iTime),8.0+0.5*sin(iTime)),1.5);
            
            vec3 mass = vec3(5.0*sin(0.6*iTime), 2.5, 15.0+5.5*iTime+4.0*cos(0.2*iTime));


            //vec2 uv = fragCoord.xy / iResolution.xy - vec2(0.5);
            //uv.x *= iResolution.x / iResolution.y;
            
            int pHits = 0;
            int sHits = 0;
            vec4 color =  vec4(0.0,0.0,0.0,1.0);
            vec3 reflectDirection;
            
            Ray ray = Ray(vec3(0.0,3.0,999.0)-6.0*rayDir, -rayDir);
            
            for (int bounce = 0; bounce<5; ++bounce) {

                for (int i=0; i<40; ++i) {
                    float distS = distFromSphere(sphere1, ray.origin);
                    float distP = distFromPlane(p1, ray.origin);
                    
                    if (distS < 0.005) {
                        sHits++;
                vec3 norm = normalize(sphere1.position - repeat(ray.origin));
                        ray.direction = reflect(ray.direction, norm);
                        ray.origin += ray.direction * 0.08;
                        break;
                    }
                    
                    if (distP < 0.005) {
                pHits++;
                        ray.direction = reflect(ray.direction, p1.normal);
                        ray.origin += ray.direction * 0.08;
                        break;	
                    }
                    

                    vec3 difference = ray.origin - mass;
              float mDist = length(difference);
                    float minDist =  min(min(distS, distP),mDist);
                    if (mDist > 600.0) break;
                    //float force = 0.02*((sin(0.23*iTime)+1.0)) / (mDist*mDist);
                    //ray.direction = normalize(ray.direction - minDist * force * difference);
                    ray.origin += ray.direction * minDist * 0.9;

                }
            } 
            
            if (pHits + sHits > 0) {
                float ph = float(pHits); 
                float sh = float(sHits);
              float angle = dot(sun.direction, ray.direction);
              //specular
              color += pow(max(angle, 0.0), 180.0) * vec4(0.8);
              color += (max(angle, 0.0) * sun.color * pow(planeColor, vec4(ph)) * pow(sphereColor, vec4(sh))) / pow(ph+sh,1.0);
              color += ambient;
            }
            
            return color.xyz;
            }\`)

            let r = getRayDirection()
            let col = march(r, 100.0+2.0*sin(0.5*time))
            noLighting()
            setMaxIterations(0)
            color(col)
            sphere(2);

      `
  } else if (shader == 'test2') { 
    return `
      let size = input()
      let pointerDown = input()
      let koch = glslFunc(\`
      //https://www.shadertoy.com/view/Mlf3RX
      float koch(vec2 p)
      {
          float ft = mod(floor(time),6.)+1.;
          p = abs(fract(p)-0.5);
          for(int i=0;i<12;++i)
          {
              if (floor(float(i)*.5) > ft)break; //"animation"
          if(time == 0.0) {
              p += vec2(p.y*1.735, -p.x*1.735);
              p.x = abs(p.x)-0.58;
              p = -vec2(-p.y, p.x)*.865;
              } else {
                p = -vec2(-p.y + p.x*1.735, abs(p.x + p.y*1.735) - 0.58)*.865; //One loc version
              }
          }
          return mod(floor(time*2.),2.)>0. ? abs(p.x)/(ft*ft)*14. : p.x/(ft*ft)*16.;
          //return p.x;
      }
      \`);
      rotateX(PI/2);
      let s= getSpace();
      let col = koch(vec2(s.x, s.z));
      color(pow(vec3(col), vec3(.1))+normal)
      sphere(col*.005+.5)
      `
  } else if (shader == 'test3') {
    return `
      let size = input()
      let pointerDown = input()
      let octahedron = glslSDF(\`
      //https://iquilezles.org/articles/distfunctions/
      float sdOctahedron( vec3 p, float s){
        p = abs(p);
        float m = p.x+p.y+p.z-s;
        vec3 q;
            if( 3.0*p.x < m ) q = p.xyz;
        else if( 3.0*p.y < m ) q = p.yzx;
        else if( 3.0*p.z < m ) q = p.zxy;
        else return m*0.57735027;
          
        float k = clamp(0.5*(q.z-q.y+s),0.0,s); 
        return length(vec3(q.x,q.y-s+k,q.z-k)); 
      }\`);

      rotateY(mouse.x * 2 * PI / 2 + time + size * .10)
      rotateX(mouse.y * 2 * PI / 2 + time + size * .10)
      rotateZ(size*.10)
      metal(.5)
      color(normalize(getRayDirection())+.2-pointerDown)
      rotateY(getRayDirection().y*4+time*size)
      grid(2.4, .1*size, .2);
      shine(.4)
      expand(-.02*size+.02)
      blend(nsin(time*(size+1))*0.1+0.1+pointerDown*.25)
      grid(2.4, .1*size, .2);
      blend(ncos(time*(size+1))*0.1+0.1+pointerDown*.25)
      octahedron(size)
    `
  } else if (shader == 'example') {
    return `
      
      let size = input();
      let pointerDown = input();

      setMaxIterations(5)

      displace(mouse.x*2, mouse.y*2, 0)

      let s = getSpace();
      let r = getRayDirection();
      let n = noise(r*4 + vec3(0,0,size*5));
      let n1 = noise(s + vec3(0,0,size*5) + n);

      metal(.5*n1 + .5)
      shine(.5*n1 + .5)

      color(normal*.1 + vec3(0,0,1))
      boxFrame(vec3(2), .1);
      mixGeo(pointerDown);
      sphere(.5 + n1 * .5);
    `
  } else if (shader == 'react') {
    return `
      let size = input();
      let pointerDown = input();

      setMaxIterations(5)

      displace(mouse.x*2, mouse.y*2, 0)

      let s = getSpace();
      let r = getRayDirection();
      let n = noise(r*4 + vec3(0,0,size*5));
      let n1 = noise(s + vec3(0,0,size*5) + n);

      metal(.5*n1 + .5)
      shine(.5*n1 + .5)

      color(normal*.1 + vec3(0,0,1))
      boxFrame(vec3(2), .1);
      mixGeo(pointerDown);
      sphere(.5 + n1 * .5);
    `
  } else if (shader == 'gpt-1') {
    return `
    let size = input();
    let pointerDown = input();
    
    // Randomly choose a shape to render
    let shapeChoice = Math.random() > 0.5 ? 'sphere' : 'boxFrame'; // Randomly choose between sphere and boxFrame
    
    // Random color selection
    let colorChoice = Math.random();
    if (colorChoice < 0.3) {
      color(Math.random() * 0.5, Math.random() * 0.5, Math.random() * 0.5); // Random dark color
    } else if (colorChoice < 0.6) {
      color(Math.random() * 0.5 + 0.5, Math.random() * 0.5, 0); // Random warm colors
    } else {
      color(Math.random() * 0.5, Math.random() * 0.5 + 0.5, Math.random() * 0.5); // Random cool colors
    }

    // Rotate in random directions
    rotateX(Math.random() * Math.PI * 2);
    rotateY(Math.random() * Math.PI * 2);
    rotateZ(Math.random() * Math.PI * 2);

    // Dynamic rotation and scaling based on time and size
    let randomTimeFactor = Math.random() * 0.1 + 0.1;
    rotateX(mouse.y * 5 * Math.PI / 2 + time * randomTimeFactor);
    rotateY(mouse.x * -5 * Math.PI / 2 + time * randomTimeFactor);

    // Metal and shine with random factors
    let randomMetal = Math.random() * 0.5 + 0.3;
    metal(randomMetal * size);
    shine(Math.random() * 0.5 + 0.3);

    // Randomly adjust the size
    size *= Math.random() * 1.5 + 0.5;

    // Box or Sphere with random size adjustments
    if (shapeChoice === 'sphere') {
      sphere(size / 2 - pointerDown * 0.3);
    } else {
      let boxSize = size - pointerDown * 0.1;
      boxFrame(vec3(size), boxSize * 0.1);
    }

    // Apply blending effects with random factors
    let randomBlend = Math.random() * 0.2 + 0.1;
    blend(nsin(time * size) * randomBlend);

    // Create an additional shape, randomly chosen between sphere, boxFrame, or grid
    let extraShape = Math.random();
    if (extraShape < 0.33) {
      sphere(size / 3);
    } else if (extraShape < 0.66) {
      boxFrame(vec3(size * 0.7), size * 0.05);
    } else {
      grid(size / 3, 10, 0.01 * size);
    }

    // Add some randomness to the blending intensity
    blend(ncos(time * (size)) * (Math.random() * 0.2 + 0.1));
    `
  } else if (shader == 'gpt-3') {
    return `
    let size = input();
    let pointerDown = input();
    
     rotateY(mouse.x * -5 * PI / 2 + time -(pointerDown+0.1))
      rotateX(mouse.y * 5 * PI / 2 + time)

    // Randomly choose a shape to render
    let shapeChoice = Math.random() > 0.5 ? 'sphere' : 'boxFrame'; // Randomly choose between sphere and boxFrame
    
    // Random color selection
    let colorChoice = Math.random();
    if (colorChoice < 0.3) {
      color(Math.random() * 0.5, Math.random() * 0.5, Math.random() * 0.5); // Random dark color
    } else if (colorChoice < 0.6) {
      color(Math.random() * 0.5 + 0.5, Math.random() * 0.5, 0); // Random warm colors
    } else {
      color(Math.random() * 0.5, Math.random() * 0.5 + 0.5, Math.random() * 0.5); // Random cool colors
    }

    // Randomize rotation using getRayDirection and time
    let randomRotateFactor = Math.random() * 2 + 1; // Random factor for more variation in rotations
    rotateX(getRayDirection().y * randomRotateFactor + time);
    rotateY(getRayDirection().x * randomRotateFactor + time);
    rotateZ(getRayDirection().z * randomRotateFactor + time);
    
    // Metal and shine with random factors
    let randomMetal = Math.random() * 0.5 + 0.3;
    metal(randomMetal * size);
    shine(Math.random() * 0.5 + 0.3);

    // Randomize size adjustment but ensure it doesn't shrink too small on pointerDown
    let adjustedSize = size - pointerDown * 0.05; // Shrink by a small amount when clicked, only minimally
    
    // Box or Sphere with random size adjustments
    if (shapeChoice === 'sphere') {
      sphere(max(0.1, adjustedSize / 2)); // Ensure it doesn't shrink to 0
    } else {
      let boxThickness = max(0.1, size * 0.1); // Limit frame thickness to prevent too thick frames
      boxFrame(vec3(adjustedSize), boxThickness);
    }

    // Apply blending effects with random factors
    let randomBlend = Math.random() * 0.2 + 0.1;
    blend(nsin(time * size) * randomBlend);

    // Create an additional shape, randomly chosen between sphere, boxFrame, or grid
    let extraShape = Math.random();
    if (extraShape < 0.33) {
      sphere(adjustedSize / 3);
    } else if (extraShape < 0.66) {
      boxFrame(vec3(adjustedSize * 0.7), adjustedSize * 0.05);
    } else {
      grid(adjustedSize / 3, 10, 0.01 * adjustedSize);
    }

    // Add some randomness to the blending intensity
    blend(ncos(time * (size)) * (Math.random() * 0.2 + 0.1));
    `
  }
    else if (shader == 'gpt-2') { 
    return `
     let size = input();
    let pointerDown = input();
    color(0.2, 1, 0.4); // Light green sphere
    metal(0.4 * size);
    rotateZ(time * 0.1); // Rotation in Z axis
    sphere(max(0.1, size * 1.2 - pointerDown * 0.1)); // Allow sphere to move dynamically at lower sizes
    color(1, 0.8, 0); // Yellow boxFrame
    boxFrame(vec3(max(0.1, size - pointerDown * 0.1), max(0.1, size - pointerDown * 0.1), max(0.1, size - pointerDown * 0.1)), 0.1); 
    `
  } else if (shader == 'generated-draft1') {
    // Define parameters and randomization logic
// Random parameters for ShaderPark
const shapeChoice = Math.random() > 0.5 ? 'sphere' : 'boxFrame';
const colorChoices = [
  `color(${Math.random() * 0.5}, ${Math.random() * 0.5}, ${Math.random() * 0.5});`, // Dark color
  `color(${Math.random() * 0.5 + 0.5}, ${Math.random() * 0.5}, 0);`, // Warm colors
  `color(${Math.random() * 0.5}, ${Math.random() * 0.5 + 0.5}, ${Math.random() * 0.5});`, // Cool colors
];
const chosenColor = colorChoices[Math.floor(Math.random() * colorChoices.length)];

const randomRotateFactor = Math.random() * 2 + 1;
const randomMetal = Math.random() * 0.5 + 0.3;
const randomShine = Math.random() * 0.5 + 0.3;
const randomBlend = Math.random() * 0.2 + 0.1;

const extraShapeChoice = Math.random();
let extraShape;
if (extraShapeChoice < 0.33) {
  extraShape = 'sphere(size / 3);';
} else if (extraShapeChoice < 0.66) {
  extraShape = 'boxFrame(vec3(size * 0.7), size * 0.05);';
} else {
  extraShape = 'grid(size / 3, 10, 0.01 * size);';
}

// Generate ShaderPark code string deterministically
const shaderCode = `
  let size = input();
  let pointerDown = input();

  rotateY(mouse.x * -5 * PI / 2 + time - (pointerDown + 0.1));
  rotateX(mouse.y * 5 * PI / 2 + time);

  // Set color
  ${chosenColor}

  // Add rotations
  rotateX(getRayDirection().y * ${randomRotateFactor} + time);
  rotateY(getRayDirection().x * ${randomRotateFactor} + time);
  rotateZ(getRayDirection().z * ${randomRotateFactor} + time);

  // Apply metal and shine
  metal(${randomMetal} * size);
  shine(${randomShine});

  // Main shape
  if ('${shapeChoice}' === 'sphere') {
    sphere(max(0.1, size / 2 - pointerDown * 0.05));
  } else {
    let boxThickness = max(0.1, size * 0.1);
    boxFrame(vec3(size - pointerDown * 0.05), boxThickness);
  }

  // Apply blending
  blend(nsin(time * size) * ${randomBlend});

  // Extra shape
  ${extraShape}
`;

return shaderCode;
  }
  else if (shader == 'background') { // Random values for color and effects
    // Randomized parameters for the skybox
    let bgColor1 = [Math.random(), Math.random(), Math.random()];
    let bgColor2 = [Math.random(), Math.random(), Math.random()];
    let cloudIntensity = Math.random() * 0.2 + 0.1; // Lower range for subtle clouds
    let starFrequency = Math.random() * 4 + 2; // Range: 2 to 6
    let starStrength = Math.random() * 0.02 + 0.01; // Brightness is subtle
    
    let skyboxShader = `
        let bgColor1 = vec3(${bgColor1[0]}, ${bgColor1[1]}, ${bgColor1[2]});
        let bgColor2 = vec3(${bgColor2[0]}, ${bgColor2[1]}, ${bgColor2[2]});
        let cloudIntensity = ${cloudIntensity};
        let starFrequency = ${starFrequency};
        let starStrength = ${starStrength};
    
        let direction = getRayDirection();
    
        // Vertical gradient (sky)
        let gradient = mix(bgColor1, bgColor2, clamp(direction.y * 0.5 + 0.5, 0.0, 1.0));
    
        // Soft cloud-like effect using nsin patterns
        let cloudEffect = nsin(direction.x * 5.0 + time * 0.1) * nsin(direction.y * 5.0 - time * 0.1);
        cloudEffect *= cloudIntensity;
    
        // Star effect using high-frequency nsin
        let starEffect = nsin(sin(direction.x * starFrequency) * sin(direction.y * starFrequency) * 20.0);
        starEffect = step(1.0 - starStrength, starEffect); // Threshold to highlight bright star points
    
        // Combine gradient, clouds, and stars, clamping to ensure visibility
        let finalColor = gradient + vec3(cloudEffect) + vec3(starEffect * 0.5);
        color(clamp(finalColor, 0.0, 1.0));
    `;

    return skyboxShader;
  }
  else if (shader == 'generated-draft3') {
      // Define parameters and randomization logic
const shapeChoice = Math.random() > 0.5 ? 'sphere' : 'boxFrame';
const colorChoices = [
  `color(${Math.random() * 0.5}, ${Math.random() * 0.5}, ${Math.random() * 0.5});`, // Dark color
  `color(${Math.random() * 0.5 + 0.5}, ${Math.random() * 0.5}, 0);`, // Warm colors
  `color(${Math.random() * 0.5}, ${Math.random() * 0.5 + 0.5}, ${Math.random() * 0.5});`, // Cool colors
];
const chosenColor = colorChoices[Math.floor(Math.random() * colorChoices.length)];

const randomRotateFactor = Math.random() * 2 + 1;
const randomMetal = Math.random() * 0.5 + 0.3;
const randomShine = Math.random() * 0.5 + 0.3;
const randomBlend = Math.random() * 0.2 + 0.1;

// Randomly vary the grid count to control density
const gridCount = Math.floor(Math.random() * 2) + 2; // Random count between 2 and 3

const extraShapeChoice = Math.random();
let extraShape;
if (extraShapeChoice < 0.33) {
  extraShape = 'sphere(size / 3);';
} else if (extraShapeChoice < 0.66) {
  extraShape = 'boxFrame(vec3(size * 0.7), size * 0.05);';
} else {
  extraShape = `grid(${gridCount}, size * 2.5, max(0.02, size * 0.01));`;  // Grid with randomized count
}

// Generate ShaderPark code string deterministically
const shaderCode = `
  let size = input();
  let pointerDown = input();

  rotateY(mouse.x * -5 * PI / 2 + time - (pointerDown + 0.1));
  rotateX(mouse.y * 5 * PI / 2 + time);

  // Set color
  ${chosenColor}

  // Add rotations
  rotateX(getRayDirection().y * ${randomRotateFactor} + time);
  rotateY(getRayDirection().x * ${randomRotateFactor} + time);
  rotateZ(getRayDirection().z * ${randomRotateFactor} + time);

  // Apply metal and shine
  metal(${randomMetal} * size);
  shine(${randomShine});

  // Main shape
  switch (${Math.floor(Math.random() * 4)}) {
    case 0:
      sphere(size / 2 - pointerDown * 0.05);
      break;
    case 1:
      boxFrame(vec3(size - pointerDown * 0.05), max(0.05, size * 0.05));
      break;
    case 2:
      torus(size * 0.6 - pointerDown * 0.05, size * 0.15);
      break;
    case 3:
      grid(${gridCount}, size * 2.5, max(0.02, size * 0.01));  // Grid with randomized count
      break;
  }

  // Apply blending
  blend(nsin(time * size) * ${randomBlend});

  // Extra shape
  ${extraShape}
`;

return shaderCode;

  }
  else if (shader == 'generated-draft2') {
    // Define parameters and randomization logic
// Random parameters for ShaderPark
const shapeChoices = ['sphere', 'boxFrame', 'torus', 'cylinder', 'grid'];
const numShapes = Math.floor(Math.random() * 4) + 2;  // Random number of shapes between 2 and 5
let shapes = [];

for (let i = 0; i < numShapes; i++) {
  const shapeChoice = shapeChoices[Math.floor(Math.random() * shapeChoices.length)];
  const sizeFactor = Math.random() * 0.5 + 0.5; // Random size factor for variability
  shapes.push({ shape: shapeChoice, sizeFactor });
}

const colorChoices = [
  `color(${Math.random() * 0.5}, ${Math.random() * 0.5}, ${Math.random() * 0.5});`, // Dark color
  `color(${Math.random() * 0.5 + 0.5}, ${Math.random() * 0.5}, 0);`, // Warm colors
  `color(${Math.random() * 0.5}, ${Math.random() * 0.5 + 0.5}, ${Math.random() * 0.5});`, // Cool colors
];
const chosenColor = colorChoices[Math.floor(Math.random() * colorChoices.length)];

const randomRotateFactor = Math.random() * 2 + 1;
const randomMetal = Math.random() * 0.5 + 0.3;
const randomShine = Math.random() * 0.5 + 0.3;
const randomBlend = Math.random() * 0.2 + 0.1;

// Generate ShaderPark code string deterministically
const shaderCode = `
  let size = input();
  let pointerDown = input();

  rotateY(mouse.x * -5 * PI / 2 + time - (pointerDown + 0.1));
  rotateX(mouse.y * 5 * PI / 2 + time);

  // Set color
  ${chosenColor}

  // Add rotations
  rotateX(getRayDirection().y * ${randomRotateFactor} + time);
  rotateY(getRayDirection().x * ${randomRotateFactor} + time);
  rotateZ(getRayDirection().z * ${randomRotateFactor} + time);

  // Apply metal and shine
  metal(${randomMetal} * size);
  shine(${randomShine});

  // Render the shapes
  ${shapes.map(({ shape, sizeFactor }) => {
    const adjustedSize = `size * ${sizeFactor} - pointerDown * 0.05`; // Adjust size dynamically
    
    switch (shape) {
      case 'sphere':
        return `sphere(${adjustedSize} / 2);`;
      case 'boxFrame':
        return `boxFrame(vec3(${adjustedSize}), ${adjustedSize} * 0.1);`;
      case 'torus':
        return `torus(${adjustedSize}, ${adjustedSize} / 4);`;
      case 'cylinder':
        return `cylinder(${adjustedSize} / 4, ${adjustedSize});`;
      case 'grid':
        return `grid(${Math.floor(Math.random() * 3) + 3}, ${adjustedSize} / 3, 0.01 * ${adjustedSize});`;
      default:
        return '';
    }
  }).join('\n')}

  // Apply blending
  blend(nsin(time * size) * ${randomBlend});
`;

return shaderCode;






  } else if (shader == 'generated-draft4') {
    // Define parameters and randomization logic
const shapeChoice = Math.random() > 0.5 ? 'sphere' : 'boxFrame';
const colorChoices = [
  `color(${Math.random() * 0.5}, ${Math.random() * 0.5}, ${Math.random() * 0.5});`, // Dark color
  `color(${Math.random() * 0.5 + 0.5}, ${Math.random() * 0.5}, 0);`, // Warm colors
  `color(${Math.random() * 0.5}, ${Math.random() * 0.5 + 0.5}, ${Math.random() * 0.5});`, // Cool colors
];
const chosenColor = colorChoices[Math.floor(Math.random() * colorChoices.length)];

const randomRotateFactor = Math.random() * 2 + 1;
const randomMetal = Math.random() * 0.5 + 0.3;
const randomShine = Math.random() * 0.5 + 0.3;
const randomBlend = Math.random() * 0.2 + 0.1;

// Randomly vary the grid count and size for more flexibility
const gridCount = Math.floor(Math.random() * 2) + 1; // Random count between 1 and 2

const extraShapeChoice = Math.random();
let extraShape;
if (extraShapeChoice < 0.33) {
  extraShape = 'sphere(size / 3);';
} else if (extraShapeChoice < 0.66) {
  extraShape = 'boxFrame(vec3(size * 0.7), size * 0.05);';
} else {
  // Adjust grid parameters using size
  extraShape = `grid(${gridCount}, size * 4, max(0.001, size * 0.003));`;  // Larger grid with controlled rod thickness
}

// Generate ShaderPark code string deterministically
const shaderCode = `
  let size = input();
  let pointerDown = input();

  rotateY(mouse.x * -5 * PI / 2 + time - (pointerDown + 0.1));
  rotateX(mouse.y * 5 * PI / 2 + time);

  // Set color
  ${chosenColor}

  // Add rotations
  rotateX(getRayDirection().y * ${randomRotateFactor} + time);
  rotateY(getRayDirection().x * ${randomRotateFactor} + time);
  rotateZ(getRayDirection().z * ${randomRotateFactor} + time);

  // Apply metal and shine
  metal(${randomMetal} * size);
  shine(${randomShine});

  // Main shape
  switch (${Math.floor(Math.random() * 4)}) {
    case 0:
      sphere(size / 2 - pointerDown * 0.05);
      break;
    case 1:
      boxFrame(vec3(size - pointerDown * 0.05), max(0.05, size * 0.05));
      break;
    case 2:
      torus(size * 0.6 - pointerDown * 0.05, size * 0.15);
      break;
    case 3:
      grid(${gridCount}, size * 3, max(0.002, size * 0.003));  // Larger grid with more spacing
      break;
  }

  // Apply blending
  blend(nsin(time * size) * ${randomBlend});

  // Extra shape
  ${extraShape}
`;

return shaderCode;


  } else
    if (shader == 'generator_v1.1') {
      // Define parameters and randomization logic
      const shapeChoices = ['sphere', 'boxFrame', 'torus', 'cylinder', 'grid'];
      const numShapes = Math.floor(Math.random() * 4) + 2;  // Random number of shapes between 2 and 5
      let shapes = [];
    
      // Randomly decide how many shapes and which shapes to include
      for (let i = 0; i < numShapes; i++) {
        const shapeChoice = shapeChoices[Math.floor(Math.random() * shapeChoices.length)];
        const sizeFactor = Math.random() * 0.5 + 0.5; // Random size factor for variability
        shapes.push({ shape: shapeChoice, sizeFactor });
      }
    
      // Color choices
      const colorChoices = [
        `color(${Math.random() * 0.5}, ${Math.random() * 0.5}, ${Math.random() * 0.5});`, // Dark color
        `color(${Math.random() * 0.5 + 0.5}, ${Math.random() * 0.5}, 0);`, // Warm colors
        `color(${Math.random() * 0.5}, ${Math.random() * 0.5 + 0.5}, ${Math.random() * 0.5});`, // Cool colors
      ];
      const chosenColor = colorChoices[Math.floor(Math.random() * colorChoices.length)];
    
      const randomRotateFactor = Math.random() * 2 + 1;
      const randomMetal = Math.random() * 0.5 + 0.3;
      const randomShine = Math.random() * 0.5 + 0.3;
      const randomBlend = Math.random() * 0.2 + 0.1;
    
      // Randomly vary the grid count and size for more flexibility
      const gridCount = Math.floor(Math.random() * 2) + 1; // Random count between 1 and 2
    
      const extraShapeChoice = Math.random();
      let extraShape;
      if (extraShapeChoice < 0.33) {
        extraShape = 'sphere(size / 3);';
      } else if (extraShapeChoice < 0.66) {
        extraShape = 'boxFrame(vec3(size * 0.7), size * 0.05);';
      } else {
        extraShape = `grid(${gridCount}, size * 4, max(0.001, size * 0.003));`;  // Larger grid with controlled rod thickness
      }
    
      // Randomize setMaxIterations and setStepSize for raymarching
      const maxIterations = Math.floor(Math.random() * 200); // Random iterations between 5000 and 15000
      const stepSize = Math.random() * 0.9; // Random step size between 0.01 and 0.05
    
      // Generate ShaderPark code string deterministically
      const shaderCode = `
        setMaxIterations(${maxIterations});
        setStepSize(${stepSize});
        
        let size = input();
        let pointerDown = input();
        time *= .1;
        rotateY(mouse.x * -5 * PI / 2 + time - (pointerDown + 0.1));
        rotateX(mouse.y * 5 * PI / 2 + time);
    
        // Set color
        ${chosenColor}
    
        // Add rotations
        rotateX(getRayDirection().y * ${randomRotateFactor} + time);
        rotateY(getRayDirection().x * ${randomRotateFactor} + time);
        rotateZ(getRayDirection().z * ${randomRotateFactor} + time);
    
        // Apply metal and shine
        metal(${randomMetal} * size);
        shine(${randomShine});
    
        // Render the shapes
        ${shapes.map(({ shape, sizeFactor }) => {
          const adjustedSize = `size * ${sizeFactor} - pointerDown * 0.05`; // Adjust size dynamically
    
          switch (shape) {
            case 'sphere':
              return `sphere(${adjustedSize} / 2);`;
            case 'boxFrame':
              return `boxFrame(vec3(${adjustedSize}), ${adjustedSize} * 0.1);`;
            case 'torus':
              return `torus(${adjustedSize}, ${adjustedSize} / 4);`;
            case 'cylinder':
              return `cylinder(${adjustedSize} / 4, ${adjustedSize});`;
            case 'grid':
              return `grid(${Math.floor(Math.random() * 3) + 3}, ${adjustedSize} / 3, 0.01 * ${adjustedSize});`;
            default:
              return '';
          }
        }).join('\n')}
    
        // Apply blending
        blend(nsin(time * size) * ${randomBlend});
    
        // Extra shape
        ${extraShape}
      `;
    
      return shaderCode;
    } else if (shader == 'generated-draft new') {
      // Define parameters and randomization logic
const shapeChoices = ['sphere', 'boxFrame', 'torus', 'cylinder', 'grid'];
const numShapes = Math.floor(Math.random() * 4) + 2; // Random number of shapes between 2 and 5
let shapes = [];

// Randomly decide how many shapes and which shapes to include
for (let i = 0; i < numShapes; i++) {
  const shapeChoice = shapeChoices[Math.floor(Math.random() * shapeChoices.length)];
  const sizeFactor = Math.random() * 0.5 + 0.5; // Random size factor for variability
  shapes.push({ shape: shapeChoice, sizeFactor });
}

// Color choices
const colorChoices = [
  `color(${Math.random() * 0.5}, ${Math.random() * 0.5}, ${Math.random() * 0.5});`, // Dark color
  `color(${Math.random() * 0.5 + 0.5}, ${Math.random() * 0.5}, 0);`, // Warm colors
  `color(${Math.random() * 0.5}, ${Math.random() * 0.5 + 0.5}, ${Math.random() * 0.5});`, // Cool colors
];
const chosenColor = colorChoices[Math.floor(Math.random() * colorChoices.length)];

const randomRotateFactor = Math.random() * 2 + 1;
const randomMetal = Math.random() * 0.5 + 0.3;
const randomShine = Math.random() * 0.5 + 0.3;
const randomBlend = Math.random() * 0.2 + 0.1;

// Randomly vary the grid count and size for more flexibility
const gridCount = Math.floor(Math.random() * 2) + 1; // Random count between 1 and 2

const extraShapeChoice = Math.random();
let extraShape;
if (extraShapeChoice < 0.33) {
  extraShape = 'sphere(size / 3);';
} else if (extraShapeChoice < 0.66) {
  extraShape = 'boxFrame(vec3(size * 0.7), size * 0.05);';
} else {
  extraShape = `grid(${gridCount}, size * 4, max(0.001, size * 0.003));`; // Larger grid with controlled rod thickness
}

// Randomize setMaxIterations and setStepSize for raymarching
const maxIterations = Math.floor(Math.random() * 200 + 1); // Random iterations between 5000 and 15000
const stepSize = Math.random() * 0.9 + 0.01; // Random step size between 0.01 and 0.05

// Randomize time multiplier
const timeMultiplier = Math.random() * 0.4 + 0.1; // Random multiplier between 0.1 and 0.5

// Generate ShaderPark code string deterministically
const shaderCode = `
  setMaxIterations(${maxIterations});
  setStepSize(${stepSize});
  
  let size = input();
  let pointerDown = input();
  time *= ${timeMultiplier};
  
  rotateY(mouse.x * -5 * PI / 2 + time - (pointerDown + 0.1));
  rotateX(mouse.y * 5 * PI / 2 + time);

  // Set color
  ${chosenColor}

  // Add rotations
  rotateX(getRayDirection().y * ${randomRotateFactor} + time);
  rotateY(getRayDirection().x * ${randomRotateFactor} + time);
  rotateZ(getRayDirection().z * ${randomRotateFactor} + time);

  // Apply metal and shine
  metal(${randomMetal} * size);
  shine(${randomShine});

  // Render the shapes
  ${shapes.map(({ shape, sizeFactor }) => {
    const adjustedSize = `size * ${sizeFactor} - pointerDown * 0.05`; // Adjust size dynamically

    switch (shape) {
      case 'sphere':
        return `sphere(${adjustedSize} / 2);`;
      case 'boxFrame':
        return `boxFrame(vec3(${adjustedSize}), ${adjustedSize} * 0.1);`;
      case 'torus':
        return `torus(${adjustedSize}, ${adjustedSize} / 4);`;
      case 'cylinder':
        return `cylinder(${adjustedSize} / 4, ${adjustedSize});`;
      case 'grid':
        return `grid(${Math.floor(Math.random() * 3) + 3}, ${adjustedSize} / 3, 0.01 * ${adjustedSize});`;
      default:
        return '';
    }
  }).join('\n')}

  // Apply blending
  blend(nsin(time * size) * ${randomBlend});

  // Extra shape
  ${extraShape}
`;

return shaderCode;

    }
    else if (shader == 'generated-draft-good2') {
      
        const shapeChoices = ['sphere', 'boxFrame', 'torus', 'cylinder', 'grid'];
        const numShapes = Math.floor(Math.random() * 4) + 2;  // Random number of shapes between 2 and 5
        let shapes = [];
      
        for (let i = 0; i < numShapes; i++) {
          const shapeChoice = shapeChoices[Math.floor(Math.random() * shapeChoices.length)];
          const sizeFactor = Math.random() * 0.5 + 0.5; // Random size factor
          shapes.push({ shape: shapeChoice, sizeFactor });
        }
      
        // Functions to return random values each time they are called
        const randomRotateFactor = function() {
          return Math.random() * 2 + 1;
        };
      
        const randomMetal = function() {
          return Math.random() * 0.5 + 0.3;
        };
      
        const randomShine = function() {
          return Math.random() * 0.5 + 0.3;
        };
      
        const randomBlend = function() {
          return Math.random() * 0.2 + 0.1;
        };
      
        const noiseFactor = function() {
          return Math.random();
        };
      
        const expansionFactor = function() {
          return Math.random() * 0.5;
        };
      
        const timeFactor = function() {
          return Math.random() * 0.9 + 0.1;
        };
      
        // Randomize colors with or without getRayDirection
        const fullGetRayProbability = 0.1; // 10%
        const twoGetRayProbability = 0.2; // 20%
        const oneGetRayProbability = 0.3; // 30%
        const constantProbability = 1 - (fullGetRayProbability + twoGetRayProbability + oneGetRayProbability); // Remaining for pure constants
      
        // Helper function to get more natural random color components
        function getRandomColorComponent() {
          return Math.random(); // A fully random component between 0 and 1
        }
      
        // Generate color based on probabilities
        let chosenColor;
        const randomValue = Math.random();
      
        if (randomValue < fullGetRayProbability) {
          // Full `getRayDirection` (10%)
          chosenColor = `color(getRayDirection().x, getRayDirection().y, getRayDirection().z);`;
        } else if (randomValue < fullGetRayProbability + twoGetRayProbability) {
          // Two `getRayDirection` components (20%)
          const axes = ['x', 'y', 'z'];
          const [axis1, axis2] = axes.sort(() => Math.random() - 0.5).slice(0, 2); // Randomly select 2 axes
          chosenColor = `color(getRayDirection().${axis1}, getRayDirection().${axis2}, ${getRandomColorComponent()});`;
        } else if (randomValue < fullGetRayProbability + twoGetRayProbability + oneGetRayProbability) {
          // One `getRayDirection` component (30%)
          const axis = ['x', 'y', 'z'][Math.floor(Math.random() * 3)]; // Randomly select 1 axis
          chosenColor = `color(getRayDirection().${axis}, ${getRandomColorComponent()}, ${getRandomColorComponent()});`;
        } else {
          // Pure constants (remaining probability)
          chosenColor = `color(${getRandomColorComponent()}, ${getRandomColorComponent()}, ${getRandomColorComponent()});`;
        }
      
        // Generate ShaderPark code string deterministically
        const shaderCode = `
          setMaxIterations(${Math.floor(Math.random() * 100)});
          setStepSize(${Math.random() * 0.9});
      
          let size = input();
          let pointerDown = input();
          time *= ${timeFactor()}; // Randomize time multiplier between 0.1 and 1
          rotateY(mouse.x * -5 * PI / 2 + time - (pointerDown + 0.1));
          rotateX(mouse.y * 5 * PI / 2 + time);
      
          // Set color
          ${chosenColor}
      
          // Get the current coordinate space once and store in s
          let s = getSpace();
      
          // Add rotations
          rotateX(getRayDirection().y * ${randomRotateFactor()} + time);
          rotateY(getRayDirection().x * ${randomRotateFactor()} + time);
          rotateZ(getRayDirection().z * ${randomRotateFactor()} + time);
      
          // Apply metal and shine
          metal(${randomMetal()} * size);
          shine(${randomShine()});
      
          // Render the shapes
          ${shapes.map(({ shape, sizeFactor }) => {
            const adjustedSize = `size * ${sizeFactor} - pointerDown * 0.05`; // Adjust size dynamically
            const n = `noise(s * ${noiseFactor()})`; // ShaderPark noise function based on the space
      
            switch (shape) {
              case 'sphere':
                return `expand(${n} * ${expansionFactor()}); sphere(${adjustedSize} / 2);`;
              case 'boxFrame':
                return `expand(${n} * ${expansionFactor()}); boxFrame(vec3(${adjustedSize}), ${adjustedSize} * 0.1);`;
              case 'torus':
                return `expand(${n} * ${expansionFactor()}); torus(${adjustedSize}, ${adjustedSize} / 4);`;
              case 'cylinder':
                return `expand(${n} * ${expansionFactor()}); cylinder(${adjustedSize} / 4, ${adjustedSize});`;
              case 'grid':
                return `expand(${n} * ${expansionFactor()}); grid(${Math.floor(Math.random() * 3) + 3}, ${adjustedSize} / 3, 0.01 * ${adjustedSize});`;
              default:
                return '';
            }
          }).join('\n')}
      
          // Apply blending
          blend(nsin(time * size) * ${randomBlend()});
      
          // Extra shape
          sphere(size / 3);
        `;
      
        return shaderCode;
      
    } else if (shader == 'generated-dd') {
        // Define parameters and randomization logic
const shapeChoices = ['sphere', 'boxFrame', 'torus', 'cylinder', 'grid'];
const numShapes = Math.floor(Math.random() * 4) + 2; // Random number of shapes between 2 and 5
let shapes = [];

// Randomly decide how many shapes and which shapes to include
for (let i = 0; i < numShapes; i++) {
  const shapeChoice = shapeChoices[Math.floor(Math.random() * shapeChoices.length)];
  const sizeFactor = Math.random() * 0.5 + 0.5; // Random size factor for variability
  shapes.push({ shape: shapeChoice, sizeFactor });
}

// Functions to return random values each time they are called
const randomRotateFactor = () => Math.random() * 2 + 1;
const randomMetal = () => Math.random() * 0.5 + 0.3;
const randomShine = () => Math.random() * 0.5 + 0.3;
const randomBlend = () => Math.random() * 0.2 + 0.1;
const noiseFactor = () => Math.random() * 2;
const expansionFactor = () => Math.random() * 0.5;
const timeFactor = () => Math.random() * 0.9 + 0.1;

// Randomize colors with or without getRayDirection
const fullGetRayProbability = 0.1; // 10%
const twoGetRayProbability = 0.2; // 20%
const oneGetRayProbability = 0.3; // 30%
const constantProbability = 1 - (fullGetRayProbability + twoGetRayProbability + oneGetRayProbability); // Remaining for pure constants

// Helper function to get more natural random color components
function getRandomColorComponent() {
  return Math.random(); // A fully random component between 0 and 1
}

// Generate color based on probabilities
let chosenColor;
const randomValue = Math.random();

if (randomValue < fullGetRayProbability) {
  // Full `getRayDirection` (10%)
  chosenColor = `color(getRayDirection().x, getRayDirection().y, getRayDirection().z);`;
} else if (randomValue < fullGetRayProbability + twoGetRayProbability) {
  // Two `getRayDirection` components (20%)
  const axes = ['x', 'y', 'z'];
  const [axis1, axis2] = axes.sort(() => Math.random() - 0.5).slice(0, 2); // Randomly select 2 axes
  chosenColor = `color(getRayDirection().${axis1}, getRayDirection().${axis2}, ${getRandomColorComponent()});`;
} else if (randomValue < fullGetRayProbability + twoGetRayProbability + oneGetRayProbability) {
  // One `getRayDirection` component (30%)
  const axis = ['x', 'y', 'z'][Math.floor(Math.random() * 3)]; // Randomly select 1 axis
  chosenColor = `color(getRayDirection().${axis}, ${getRandomColorComponent()}, ${getRandomColorComponent()});`;
} else {
  // Pure constants (remaining probability)
  chosenColor = `color(${getRandomColorComponent()}, ${getRandomColorComponent()}, ${getRandomColorComponent()});`;
}

// Randomly vary the grid count and size for more flexibility
const gridCount = Math.floor(Math.random() * 2) + 1; // Random count between 1 and 2

const extraShapeChoice = Math.random();
let extraShape;
if (extraShapeChoice < 0.33) {
  extraShape = 'sphere(size / 3);';
} else if (extraShapeChoice < 0.66) {
  extraShape = 'boxFrame(vec3(size * 0.7), size * 0.05);';
} else {
  extraShape = `grid(${gridCount}, size * 4, max(0.001, size * 0.003));`; // Larger grid with controlled rod thickness
}

// Randomize setMaxIterations and setStepSize for raymarching
const maxIterations = Math.floor(Math.random() * 200); // Random iterations between 5000 and 15000
const stepSize = Math.random() * 0.9; // Random step size between 0.01 and 0.05

// Generate ShaderPark code string deterministically
const shaderCode = `
  setMaxIterations(${maxIterations});
  setStepSize(${stepSize});

  let size = input();
  let pointerDown = input();
  time *= ${timeFactor()}; // Randomize time multiplier between 0.1 and 1
  rotateY(mouse.x * -5 * PI / 2 + time - (pointerDown + 0.1));
  rotateX(mouse.y * 5 * PI / 2 + time);

  // Set color
  ${chosenColor}

  // Get the current coordinate space once and store in s
  let s = getSpace();

  // Add rotations
  rotateX(getRayDirection().y * ${randomRotateFactor()} + time);
  rotateY(getRayDirection().x * ${randomRotateFactor()} + time);
  rotateZ(getRayDirection().z * ${randomRotateFactor()} + time);

  // Apply metal and shine
  metal(${randomMetal()} * size);
  shine(${randomShine()});

  // Render the shapes
  ${shapes.map(({ shape, sizeFactor }) => {
    const adjustedSize = `size * ${sizeFactor} - pointerDown * 0.05`; // Adjust size dynamically
    const n = `noise(s * ${noiseFactor()})`; // ShaderPark noise function based on the space
    const applyNoise = Math.random() < 0.5; // Randomly decide whether to apply noise to this shape

    switch (shape) {
      case 'sphere':
        return applyNoise
          ? `expand(${n} * ${expansionFactor()}); sphere(${adjustedSize} / 2);`
          : `sphere(${adjustedSize} / 2);`;
      case 'boxFrame':
        return applyNoise
          ? `expand(${n} * ${expansionFactor()}); boxFrame(vec3(${adjustedSize}), ${adjustedSize} * 0.1);`
          : `boxFrame(vec3(${adjustedSize}), ${adjustedSize} * 0.1);`;
      case 'torus':
        return applyNoise
          ? `expand(${n} * ${expansionFactor()}); torus(${adjustedSize}, ${adjustedSize} / 4);`
          : `torus(${adjustedSize}, ${adjustedSize} / 4);`;
      case 'cylinder':
        return applyNoise
          ? `expand(${n} * ${expansionFactor()}); cylinder(${adjustedSize} / 4, ${adjustedSize});`
          : `cylinder(${adjustedSize} / 4, ${adjustedSize});`;
      case 'grid':
        return applyNoise
          ? `expand(${n} * ${expansionFactor()}); grid(${Math.floor(Math.random() * 3) + 3}, ${adjustedSize} / 3, 0.01 * ${adjustedSize});`
          : `grid(${Math.floor(Math.random() * 3) + 3}, ${adjustedSize} / 3, 0.01 * ${adjustedSize});`;
      default:
        return '';
    }
  }).join('\n')}

  // Apply blending
  blend(nsin(time * size) * ${randomBlend()});

  // Extra shape
  ${extraShape}
`;

return shaderCode;
    } else if (shader == 'generatedddd') {
      
      // Define parameters and randomization logic
const shapeChoices = ['sphere', 'boxFrame', 'torus', 'cylinder', 'grid'];
const numShapes = Math.floor(Math.random() * 4) + 2; // Random number of shapes between 2 and 5
let shapes = [];

// Randomly decide how many shapes and which shapes to include
for (let i = 0; i < numShapes; i++) {
  const shapeChoice = shapeChoices[Math.floor(Math.random() * shapeChoices.length)];
  const sizeFactor = Math.random() * 0.5 + 0.5; // Random size factor for variability
  shapes.push({ shape: shapeChoice, sizeFactor });
}

// Functions to return random values each time they are called
const randomRotateFactor = () => Math.random() * 2 + 1;
const randomMetal = () => Math.random() * 0.5 + 0.3;
const randomShine = () => Math.random() * 0.5 + 0.3;
const randomBlend = () => Math.random() * 0.2 + 0.1;
const noiseFactor = () => Math.random() * 2;
const expansionFactor = () => Math.random() * 0.5;
const timeFactor = () => Math.random() * 0.9 + 0.1;

// Randomize colors with or without getRayDirection
const fullGetRayProbability = 0.1; // 10%
const twoGetRayProbability = 0.2; // 20%
const oneGetRayProbability = 0.3; // 30%
const constantProbability = 1 - (fullGetRayProbability + twoGetRayProbability + oneGetRayProbability); // Remaining for pure constants

// Helper function to get more natural random color components
function getRandomColorComponent() {
  return Math.random(); // A fully random component between 0 and 1
}

// Generate color based on probabilities
let chosenColor;
const randomValue = Math.random();

if (randomValue < fullGetRayProbability) {
  // Full `getRayDirection` (10%)
  chosenColor = `color(getRayDirection().x, getRayDirection().y, getRayDirection().z);`;
} else if (randomValue < fullGetRayProbability + twoGetRayProbability) {
  // Two `getRayDirection` components (20%)
  const axes = ['x', 'y', 'z'];
  const [axis1, axis2] = axes.sort(() => Math.random() - 0.5).slice(0, 2); // Randomly select 2 axes
  chosenColor = `color(getRayDirection().${axis1}, getRayDirection().${axis2}, ${getRandomColorComponent()});`;
} else if (randomValue < fullGetRayProbability + twoGetRayProbability + oneGetRayProbability) {
  // One `getRayDirection` component (30%)
  const axis = ['x', 'y', 'z'][Math.floor(Math.random() * 3)]; // Randomly select 1 axis
  chosenColor = `color(getRayDirection().${axis}, ${getRandomColorComponent()}, ${getRandomColorComponent()});`;
} else {
  // Pure constants (remaining probability)
  chosenColor = `color(${getRandomColorComponent()}, ${getRandomColorComponent()}, ${getRandomColorComponent()});`;
}

// Randomly vary the grid count and size for more flexibility
const gridCount = Math.floor(Math.random() * 2) + 0.99; // Random count between 1 and 2

const extraShapeChoice = Math.random();
let extraShape;
if (extraShapeChoice < 0.33) {
  extraShape = 'sphere(size / 3);';
} else if (extraShapeChoice < 0.66) {
  extraShape = 'boxFrame(vec3(size * 0.7), size * 0.05);';
} else {
  extraShape = `grid(${gridCount}, size * 4, max(0.001, size * 0.003));`; // Larger grid with controlled rod thickness
}

// Randomize setMaxIterations and setStepSize for raymarching
const maxIterations = 50;//Math.floor(Math.random() * 200 + 10); // Random iterations between 10 and 200
const stepSize = 0.9;//Math.random() * 0.89 + 0.1; // Random step size between 0.1 and 0.99

// Generate ShaderPark code string deterministically
const shaderCode = `
  setMaxIterations(${maxIterations});
  setStepSize(${stepSize});

  let size = input();
  let pointerDown = input();
  time *= ${timeFactor()}; // Randomize time multiplier between 0.1 and 1
  rotateY(mouse.x * -5 * PI / 2 + time - (pointerDown + 0.1));
  rotateX(mouse.y * 5 * PI / 2 + time);

  // Set color
  ${chosenColor}

  // Get the current coordinate space once and store in s
  let s = getSpace();

  // Add rotations
  rotateX(getRayDirection().y * ${randomRotateFactor()} + time);
  rotateY(getRayDirection().x * ${randomRotateFactor()} + time);
  rotateZ(getRayDirection().z * ${randomRotateFactor()} + time);

  // Apply metal and shine
  metal(${randomMetal()} * size);
  shine(${randomShine()});

  // Render the shapes
  ${shapes.map(({ shape, sizeFactor }) => {
    const adjustedSize = `size * ${sizeFactor} - pointerDown * 0.05`; // Adjust size dynamically
    const n = `noise(s * ${noiseFactor()})`; // ShaderPark noise function based on the space
    const applyNoise = Math.random() < 0.5; // Randomly decide whether to apply noise to this shape

    switch (shape) {
      case 'sphere':
        return applyNoise
          ? `expand(${n} * ${expansionFactor()}); sphere(${adjustedSize} / 2);`
          : `sphere(${adjustedSize} / 2);`;
      case 'boxFrame':
        return applyNoise
          ? `expand(${n} * ${expansionFactor()}); boxFrame(vec3(${adjustedSize}), ${adjustedSize} * 0.1);`
          : `boxFrame(vec3(${adjustedSize}), ${adjustedSize} * 0.1);`;
      case 'torus':
        return applyNoise
          ? `expand(${n} * ${expansionFactor()}); torus(${adjustedSize}, ${adjustedSize} / 4);`
          : `torus(${adjustedSize}, ${adjustedSize} / 4);`;
      case 'cylinder':
        return applyNoise
          ? `expand(${n} * ${expansionFactor()}); cylinder(${adjustedSize} / 4, ${adjustedSize});`
          : `cylinder(${adjustedSize} / 4, ${adjustedSize});`;
      case 'grid':
        return applyNoise
          ? `expand(${n} * ${expansionFactor()}); grid(${Math.floor(Math.random() * 3) + 3}, ${adjustedSize} / 3, 0.01 * ${adjustedSize});`
          : `grid(${Math.floor(Math.random() * 3) + 3}, ${adjustedSize} / 3, 0.01 * ${adjustedSize});`;
      default:
        return '';
    }
  }).join('\n')}

  // Apply blending
  blend(nsin(time * size) * ${randomBlend()});

  // Extra shape
  ${extraShape}
`;
  
return shaderCode;

    } else if (shader == 'generated-agAIN'){
      

        const shapeChoices = ['sphere', 'boxFrame', 'torus', 'cylinder', 'grid'];
        const numShapes = Math.floor(Math.random() * 4) + 2; // Random number of shapes between 2 and 5
        let shapes = [];
      
        // Randomly decide how many shapes and which shapes to include
        for (let i = 0; i < numShapes; i++) {
          const shapeChoice = shapeChoices[Math.floor(Math.random() * shapeChoices.length)];
          const sizeFactor = Math.random() * 0.5 + 0.5; // Random size factor for variability
          shapes.push({ shape: shapeChoice, sizeFactor });
        }
      
        // Functions to return random values each time they are called
        const randomRotateFactor = () => Math.random() * 2 + 1;
        const randomMetal = () => Math.random() * 0.5 + 0.3;
        const randomShine = () => Math.random() * 0.5 + 0.3;
        const randomBlend = () => Math.random() * 0.2 + 0.1;
        const noiseFactor = () => Math.random() * 2;
        const expansionFactor = () => Math.random() * 0.5;
        const timeFactor = () => Math.random() * 0.9 + 0.1;
      
        // Randomize colors with or without getRayDirection
        const fullGetRayProbability = 0.1; // 10%
        const twoGetRayProbability = 0.2; // 20%
        const oneGetRayProbability = 0.3; // 30%
        const constantProbability = 1 - (fullGetRayProbability + twoGetRayProbability + oneGetRayProbability); // Remaining for pure constants
      
        // Helper function to get more natural random color components
        function getRandomColorComponent() {
          return Math.random(); // A fully random component between 0 and 1
        }
      
        // Generate color based on probabilities
        let chosenColor;
        const randomValue = Math.random();
      
        if (randomValue < fullGetRayProbability) {
          // Full `getRayDirection` (10%)
          chosenColor = `color(getRayDirection().x, getRayDirection().y, getRayDirection().z);`;
        } else if (randomValue < fullGetRayProbability + twoGetRayProbability) {
          // Two `getRayDirection` components (20%)
          const axes = ['x', 'y', 'z'];
          const [axis1, axis2] = axes.sort(() => Math.random() - 0.5).slice(0, 2); // Randomly select 2 axes
          chosenColor = `color(getRayDirection().${axis1}, getRayDirection().${axis2}, ${getRandomColorComponent()});`;
        } else if (randomValue < fullGetRayProbability + twoGetRayProbability + oneGetRayProbability) {
          // One `getRayDirection` component (30%)
          const axis = ['x', 'y', 'z'][Math.floor(Math.random() * 3)]; // Randomly select 1 axis
          chosenColor = `color(getRayDirection().${axis}, ${getRandomColorComponent()}, ${getRandomColorComponent()});`;
        } else {
          // Pure constants (remaining probability)
          chosenColor = `color(${getRandomColorComponent()}, ${getRandomColorComponent()}, ${getRandomColorComponent()});`;
        }
      
        // Randomly vary the grid count and size for more flexibility
        const gridCount = Math.floor(Math.random() * 2) + 1; // Random count between 1 and 2
      
        const extraShapeChoice = Math.random();
        let extraShape;
        if (extraShapeChoice < 0.33) {
          extraShape = 'sphere(size / 3);';
        } else if (extraShapeChoice < 0.66) {
          extraShape = 'boxFrame(vec3(size * 0.7), size * 0.05);';
        } else {
          extraShape = `grid(${gridCount}, size * 4, max(0.001, size * 0.003));`; // Larger grid with controlled rod thickness
        }
      
        // Randomize setMaxIterations and setStepSize for raymarching
        const maxIterations = Math.floor(Math.random() * 200); // Random iterations between 5000 and 15000
        const stepSize = Math.random() * 0.9; // Random step size between 0.01 and 0.05
      
        // Generate ShaderPark code string deterministically
        const shaderCode = `
          setMaxIterations(${maxIterations});
          setStepSize(${stepSize});
      
          let size = input();
          let pointerDown = input();
          time *= ${timeFactor()}; // Randomize time multiplier between 0.1 and 1
          rotateY(mouse.x * -5 * PI / 2 + time - (pointerDown + 0.1));
          rotateX(mouse.y * 5 * PI / 2 + time);
      
          // Set color
          ${chosenColor}
      
          // Get the current coordinate space once and store in s
          let s = getSpace();
      
          // Add rotations
          rotateX(getRayDirection().y * ${randomRotateFactor()} + time);
          rotateY(getRayDirection().x * ${randomRotateFactor()} + time);
          rotateZ(getRayDirection().z * ${randomRotateFactor()} + time);
      
          // Apply metal and shine
          metal(${randomMetal()} * size);
          shine(${randomShine()});
      
          // Render the shapes
          ${shapes.map(({ shape, sizeFactor }) => {
            const adjustedSize = `size * ${sizeFactor} - pointerDown * 0.05`; // Adjust size dynamically
            const n = `noise(s * ${noiseFactor()})`; // ShaderPark noise function based on the space
            const applyNoise = Math.random() < 0.5; // Randomly decide whether to apply noise to this shape
      
            switch (shape) {
              case 'sphere':
                return applyNoise
                  ? `expand(${n} * ${expansionFactor()}); sphere(${adjustedSize} / 2);`
                  : `sphere(${adjustedSize} / 2);`;
              case 'boxFrame':
                return applyNoise
                  ? `expand(${n} * ${expansionFactor()}); boxFrame(vec3(${adjustedSize}), ${adjustedSize} * 0.1);`
                  : `boxFrame(vec3(${adjustedSize}), ${adjustedSize} * 0.1);`;
              case 'torus':
                return applyNoise
                  ? `expand(${n} * ${expansionFactor()}); torus(${adjustedSize}, ${adjustedSize} / 4);`
                  : `torus(${adjustedSize}, ${adjustedSize} / 4);`;
              case 'cylinder':
                return applyNoise
                  ? `expand(${n} * ${expansionFactor()}); cylinder(${adjustedSize} / 4, ${adjustedSize});`
                  : `cylinder(${adjustedSize} / 4, ${adjustedSize});`;
              case 'grid':
                return applyNoise
                  ? `expand(${n} * ${expansionFactor()}); grid(${Math.floor(Math.random() * 3) + 3}, ${adjustedSize} / 3, 0.01 * ${adjustedSize});`
                  : `grid(${Math.floor(Math.random() * 3) + 3}, ${adjustedSize} / 3, 0.01 * ${adjustedSize});`;
              default:
                return '';
            }
          }).join('\n')}
      
          // Apply blending
          blend(nsin(time * size) * ${randomBlend()});
      
          // Extra shape
          ${extraShape}
        `;
      
        return shaderCode;
    
      
    } else if (shader == 'generated-again') {
        const shapeChoices = ['sphere', 'boxFrame', 'torus', 'cylinder', 'grid'];
        const numShapes = Math.floor(Math.random() * 4) + 2; // Random number of shapes between 2 and 5
        let shapes = [];
      
        // Randomly decide how many shapes and which shapes to include
        for (let i = 0; i < numShapes; i++) {
          const shapeChoice = shapeChoices[Math.floor(Math.random() * shapeChoices.length)];
          const sizeFactor = Math.random() * 0.5 + 0.5; // Random size factor for variability
          shapes.push({ shape: shapeChoice, sizeFactor });
        }
      
        // Functions to return random values each time they are called
        const randomRotateFactor = () => Math.random() * 2 + 1;
        const randomBoolean = () => Math.random() < 0.5;
        const useSameFactor = () => Math.random() < 0.3; // Adjust probability for shared factors
        const sharedFactor = randomRotateFactor(); // Shared rotation factor
      
        const randomMetal = () => Math.random() * 0.5 + 0.3;
        const randomShine = () => Math.random() * 0.5 + 0.3;
        const randomBlend = () => Math.random() * 0.2 + 0.1;
        const noiseFactor = () => Math.random() * 2;
        const expansionFactor = () => Math.random() * 0.5;
        const timeFactor = () => Math.random() * 0.9 + 0.1;
      
        // Rotation variables
        const rotateXActive = randomBoolean();
        const rotateYActive = randomBoolean();
        const rotateZActive = randomBoolean();
      
        const rotateXFactor = randomRotateFactor();
        const rotateYFactor = useSameFactor() ? sharedFactor : randomRotateFactor();
        const rotateZFactor = useSameFactor() ? sharedFactor : randomRotateFactor();
      
        // Generate ShaderPark code string deterministically
        const shaderCode = `
          setMaxIterations(${Math.floor(Math.random() * 200)});
          setStepSize(${Math.random() * 0.9});
      
          let size = input();
          let pointerDown = input();
          time *= ${timeFactor()}; // Randomize time multiplier between 0.1 and 1
      
          // Rotations with conditional application
          ${rotateXActive ? `rotateX(getRayDirection().y * ${rotateXFactor} + time * ${rotateXFactor});` : ''}
          ${rotateYActive ? `rotateY(getRayDirection().x * ${rotateYFactor} + time * ${rotateYFactor});` : ''}
          ${rotateZActive ? `rotateZ(getRayDirection().z * ${rotateZFactor} + time * ${rotateZFactor});` : ''}
      
          // Set color
          color(getRayDirection().x, getRayDirection().y, getRayDirection().z);
      
          let s = getSpace();
      
          // Render the shapes
          ${shapes.map(({ shape, sizeFactor }) => {
            const adjustedSize = `size * ${sizeFactor} - pointerDown * 0.05`;
            const n = `noise(s * ${noiseFactor()})`;
            const applyNoise = Math.random() < 0.5;
      
            switch (shape) {
              case 'sphere':
                return applyNoise
                  ? `expand(${n} * ${expansionFactor()}); sphere(${adjustedSize} / 2);`
                  : `sphere(${adjustedSize} / 2);`;
              case 'boxFrame':
                return applyNoise
                  ? `expand(${n} * ${expansionFactor()}); boxFrame(vec3(${adjustedSize}), ${adjustedSize} * 0.1);`
                  : `boxFrame(vec3(${adjustedSize}), ${adjustedSize} * 0.1);`;
              case 'torus':
                return applyNoise
                  ? `expand(${n} * ${expansionFactor()}); torus(${adjustedSize}, ${adjustedSize} / 4);`
                  : `torus(${adjustedSize}, ${adjustedSize} / 4);`;
              case 'cylinder':
                return applyNoise
                  ? `expand(${n} * ${expansionFactor()}); cylinder(${adjustedSize} / 4, ${adjustedSize});`
                  : `cylinder(${adjustedSize} / 4, ${adjustedSize});`;
              case 'grid':
                return applyNoise
                  ? `expand(${n} * ${expansionFactor()}); grid(${Math.floor(Math.random() * 3) + 3}, ${adjustedSize} / 3, 0.01 * ${adjustedSize});`
                  : `grid(${Math.floor(Math.random() * 3) + 3}, ${adjustedSize} / 3, 0.01 * ${adjustedSize});`;
              default:
                return '';
            }
          }).join('\n')}
      
          blend(nsin(time * size) * ${randomBlend()});
        `;
      
        return shaderCode;
      
    } else if (shader == 'default') {
      const shapeChoices = ['sphere', 'boxFrame', 'torus', 'cylinder', 'grid'];
const numShapes = Math.floor(Math.random() * 4) + 2; // Random number of shapes between 2 and 5
let shapes = [];

// Randomly decide how many shapes and which shapes to include
for (let i = 0; i < numShapes; i++) {
  const shapeChoice = shapeChoices[Math.floor(Math.random() * shapeChoices.length)];
  const sizeFactor = Math.random() * 0.5 + 0.5; // Random size factor for variability
  shapes.push({ shape: shapeChoice, sizeFactor });
}

// Functions to return random values each time they are called
const randomRotateFactor = () => Math.random() * 2 + 1;
const randomBoolean = () => Math.random() < 0.5;
const useSameFactor = () => Math.random() < 0.3; // Adjust probability for shared factors
const sharedFactor = randomRotateFactor(); // Shared rotation factor

const randomMetal = () => Math.random() * 0.5 + 0.3;
const randomShine = () => Math.random() * 0.5 + 0.3;
const randomBlend = () => Math.random() * 0.2 + 0.1;
const noiseFactor = () => Math.random() * 2;
const expansionFactor = () => Math.random() * 0.5;
const timeFactor = () => Math.random() * 0.9 + 0.1;

// Rotation variables
const rotateXActive = randomBoolean();
const rotateYActive = randomBoolean();
const rotateZActive = randomBoolean();

const rotateXFactor = randomRotateFactor();
const rotateYFactor = useSameFactor() ? sharedFactor : randomRotateFactor();
const rotateZFactor = useSameFactor() ? sharedFactor : randomRotateFactor();

// Generate ShaderPark code string deterministically
const shaderCode = `
  setMaxIterations(${Math.floor(Math.random() * 200)});
  setStepSize(${Math.random() * 0.9});

  let size = input();
  let pointerDown = input();
  time *= ${timeFactor()}; // Randomize time multiplier between 0.1 and 1

  // Rotations with conditional application
  ${rotateXActive ? `rotateX(getRayDirection().y * ${rotateXFactor} + time * ${rotateXFactor});` : ''}
  ${rotateYActive ? `rotateY(getRayDirection().x * ${rotateYFactor} + time * ${rotateYFactor});` : ''}
  ${rotateZActive ? `rotateZ(getRayDirection().z * ${rotateZFactor} + time * ${rotateZFactor});` : ''}

  // Set color
  color(clamp(getRayDirection().x, 0, 0.5), clamp(getRayDirection().y, 0, 0.5), clamp(getRayDirection().z, 0, 0.5));

  let s = getSpace();

  // Render the shapes
  ${shapes.map(({ shape, sizeFactor }) => {
    const adjustedSize = `size * ${sizeFactor} - pointerDown * 0.05`;
    const n = `noise(s * ${noiseFactor()})`;
    const applyNoise = Math.random() < 0.5;
    const metal = randomMetal();
    const shine = randomShine();

    switch (shape) {
      case 'sphere':
        return applyNoise
          ? `expand(${n} * ${expansionFactor()}); metal(${metal}); shine(${shine}); sphere(${adjustedSize} / 2);`
          : `metal(${metal}); shine(${shine}); sphere(${adjustedSize} / 2);`;
      case 'boxFrame':
        return applyNoise
          ? `expand(${n} * ${expansionFactor()}); metal(${metal}); shine(${shine}); boxFrame(vec3(${adjustedSize}), ${adjustedSize} * 0.1);`
          : `metal(${metal}); shine(${shine}); boxFrame(vec3(${adjustedSize}), ${adjustedSize} * 0.1);`;
      case 'torus':
        return applyNoise
          ? `expand(${n} * ${expansionFactor()}); metal(${metal}); shine(${shine}); torus(${adjustedSize}, ${adjustedSize} / 4);`
          : `metal(${metal}); shine(${shine}); torus(${adjustedSize}, ${adjustedSize} / 4);`;
      case 'cylinder':
        return applyNoise
          ? `expand(${n} * ${expansionFactor()}); metal(${metal}); shine(${shine}); cylinder(${adjustedSize} / 4, ${adjustedSize});`
          : `metal(${metal}); shine(${shine}); cylinder(${adjustedSize} / 4, ${adjustedSize});`;
      case 'grid':
        return applyNoise
          ? `expand(${n} * ${expansionFactor()}); metal(${metal}); shine(${shine}); grid(${Math.floor(Math.random() * 3) + 3}, ${adjustedSize} / 3, 0.01 * ${adjustedSize});`
          : `metal(${metal}); shine(${shine}); grid(${Math.floor(Math.random() * 3) + 3}, ${adjustedSize} / 3, 0.01 * ${adjustedSize});`;
      default:
        return '';
    }
  }).join('\n')}

  blend(nsin(time * size) * ${randomBlend()});
`;

return shaderCode;

    
    }
}
    

//
// let size = input();
// rotateY(mouse.x * PI / 2 + time*.5)
// rotateX(mouse.y * PI / 2 + time*.5)
// rotateZ(mouse.x - mouse.y * PI / 2 + time*.5)
// metal(.5)
// color(getRayDirection()+.2)
// rotateY(getRayDirection().y*4+time)
// boxFrame(vec3(size), size/2)
// shine(.4)
// expand(.02)
// blend(nsin(time)*.6)
// sphere(size/2)