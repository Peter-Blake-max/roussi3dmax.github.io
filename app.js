import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let camera, scene, renderer, orbit, control;
let objectCount = 0;
let selectedObject = null;
let boundingBox, boundingBoxHelper;
let objectList = [];

const loader = new GLTFLoader();

let isTransforming = false;
let lastTransformTime = 0;
const TRANSFORM_COOLDOWN = 200; // millisecondes

let lastRotationY = 0;

init();
render();

async function init() {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true; // Garder les ombres activées
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Ombres douces
    document.body.appendChild(renderer.domElement);

    const aspect = window.innerWidth / window.innerHeight;

    camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
    camera.position.set(0, 5, 10);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x808080);
    
    // Remettre la grille
    const gridHelper = new THREE.GridHelper(10, 10);
    scene.add(gridHelper);

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(5, 10, 5);
    light.castShadow = true; // La lumière projette des ombres
    light.shadow.mapSize.width = 1024;
    light.shadow.mapSize.height = 1024;
    light.shadow.camera.near = 1;
    light.shadow.camera.far = 20;
    scene.add(light);

    // Garder la lumière ambiante
    const ambientLight = new THREE.AmbientLight(0x9D9D9D);
    scene.add(ambientLight);

    // Supprimez la création du cube initial et remplacez-la par :
    await loadInitialObject();

    orbit = new OrbitControls(camera, renderer.domElement);
    orbit.update();
    orbit.addEventListener('change', render);

    control = new TransformControls(camera, renderer.domElement);
    control.addEventListener('change', render);
    control.addEventListener('dragging-changed', function (event) {
        console.log("Événement dragging-changed:", event.value);
        orbit.enabled = !event.value;
        isTransforming = event.value;
        if (!event.value) {
            lastTransformTime = Date.now();
        }
    });
    
    control.addEventListener('objectChange', function () {
        if (control.getMode() === 'rotate') {
            const object = control.object;
            if (object) {
                const quaternion = new THREE.Quaternion();
                quaternion.setFromEuler(object.rotation);

                const rotationY = Math.atan2(2 * (quaternion.w * quaternion.y + quaternion.x * quaternion.z), 1 - 2 * (quaternion.y * quaternion.y + quaternion.z * quaternion.z));

                const newQuaternion = new THREE.Quaternion();
                newQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);

                object.setRotationFromQuaternion(newQuaternion);

                lastRotationY = rotationY;
            }
        }
    });

    scene.add(control);

    window.addEventListener('resize', onWindowResize);
    window.addEventListener('keydown', onKeyDown);

    await displayObjectList();

    const objectListContainer = document.createElement('div');
    objectListContainer.id = 'objectList';
    objectListContainer.style.position = 'absolute';
    objectListContainer.style.top = '100px'; // Modifié de '10px' à '50px'
    objectListContainer.style.right = '10px';
    objectListContainer.style.backgroundColor = 'rgba(255, 255, 255, 0.7)';
    objectListContainer.style.padding = '10px';
    document.body.appendChild(objectListContainer);

    updateObjectList();

    animate();

    renderer.domElement.addEventListener('click', onCanvasClick);

    // Ajouter les écouteurs d'événements pour les boutons de sauvegarde et de chargement
    document.getElementById('saveButton').addEventListener('click', saveScene);
    document.getElementById('loadButton').addEventListener('click', loadScene);
}

// Ajoutez cette nouvelle fonction pour charger l'objet initial
async function loadInitialObject() {
    return new Promise((resolve, reject) => {
        loader.load(
            './geoBase/votre_objet.gltf', // Assurez-vous que ce chemin est correct
            function (gltf) {
                const model = gltf.scene;
                model.name = 'initialObject';
                model.position.set(0, 0, 0);
                model.userData.selectable = false;
                model.userData.listable = false; // Ajoutez cette ligne
                
                model.traverse((child) => {
                    child.userData.selectable = false;
                    child.userData.listable = false; // Ajoutez cette ligne
                    if (child.isMesh) {
                        child.castShadow = false; // L'objet initial ne projette pas d'ombre
                        child.receiveShadow = true; // Mais il reçoit les ombres
                    }
                });
                
                scene.add(model);
                objectList.push(model);
                console.log("Objet initial chargé:", model.name);
                resolve();
            },
            undefined,
            function (error) {
                console.error('Une erreur s\'est produite lors du chargement de l\'objet initial:', error);
                reject(error);
            }
        );
    });
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    render();
}

function onKeyDown(event) {
    switch (event.key.toLowerCase()) {
        case 'w': 
            control.setMode('translate'); 
            control.showX = true;
            control.showY = true;
            control.showZ = true;
            break;
        case 'e': 
            control.setMode('rotate'); 
            control.showX = false;
            control.showZ = false;
            control.showY = true;
            break;
        case 'r': 
            control.setMode('scale');
            control.showX = true;
            control.showY = true;
            control.showZ = true;
            break;
        case '+':
        case '=': control.setSize(control.size + 0.1); break;
        case '-':
        case '_': control.setSize(Math.max(control.size - 0.1, 0.1)); break;
        case 'x': control.showX = !control.showX; break;
        case 'y': control.showY = !control.showY; break;
        case 'z': control.showZ = !control.showZ; break;
        case ' ': control.enabled = !control.enabled; break;
        case 'escape': control.reset(); break;
        case 'delete': deleteSelectedObject(); break;
    }
    render();
}

function render() {
    renderer.render(scene, camera);
}

function selectObject(object) {
    console.log("Début de selectObject");
    console.log("Objet à sélectionner:", object ? object.name : "null");

    if (object === selectedObject) {
        console.log("Objet déjà sélectionné, aucune action");
        return;
    }

    if (selectedObject) {
        console.log("Détachement de l'objet précédemment sélectionné:", selectedObject.name);
        control.detach();
        if (selectedObject.material && selectedObject.material.emissive) {
            selectedObject.material.emissive.setHex(0x000000);
        }
        removeBoundingBox();
    }
    
    selectedObject = object;
    
    if (selectedObject) {
        console.log("Attachement du nouvel objet sélectionné:", selectedObject.name);
        control.attach(selectedObject);
        if (selectedObject.material && selectedObject.material.emissive) {
            selectedObject.material.emissive.setHex(0x555555);
        }
        addBoundingBox(selectedObject);
        console.log("Objet sélectionné:", selectedObject.name);
    } else {
        console.log("Aucun objet sélectionné");
    }
    
    control.visible = !!selectedObject;
    updateObjectList();
    render();
    console.log("Fin de selectObject");
}

function onCanvasClick(event) {
    console.log("Début de onCanvasClick");
    console.log("isTransforming:", isTransforming);
    
    if (isTransforming || Date.now() - lastTransformTime < TRANSFORM_COOLDOWN) {
        console.log("Transformation récente, clic ignoré");
        return;
    }

    event.preventDefault();
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const selectableObjects = scene.children.filter(obj => 
        (obj.type === 'Mesh' || obj.type === 'Group') && 
        obj.name && 
        obj.name !== 'initialCube' &&
        !obj.name.startsWith('helper') &&
        obj.userData.selectable !== false
    );

    console.log("Objets sélectionnables:", selectableObjects.map(obj => obj.name));

    const intersects = raycaster.intersectObjects(selectableObjects, true);

    console.log("Intersections:", intersects.map(i => i.object.name));

    if (intersects.length > 0) {
        let clickedObject = intersects[0].object;
        console.log("Objet cliqué initial:", clickedObject.name);
        
        while (clickedObject.parent && !selectableObjects.includes(clickedObject)) {
            clickedObject = clickedObject.parent;
            console.log("Remontée dans la hiérarchie:", clickedObject.name);
        }
        
        if (selectableObjects.includes(clickedObject)) {
            console.log("Sélection de l'objet:", clickedObject.name);
            selectObject(clickedObject);
        } else {
            console.log("Aucun objet sélectionnable trouvé, désélection");
            selectObject(null);
        }
    } else {
        console.log("Aucune intersection, désélection");
        selectObject(null);
    }

    console.log("Fin de onCanvasClick");
}

function animate() {
    requestAnimationFrame(animate);
    orbit.update();
    updateBoundingBox();
    render();
}

function addBoundingBox(object) {
    removeBoundingBox();

    boundingBox = new THREE.Box3().setFromObject(object);
    boundingBoxHelper = new THREE.Box3Helper(boundingBox, 0xffff00);
    scene.add(boundingBoxHelper);
}

function removeBoundingBox() {
    if (boundingBoxHelper) scene.remove(boundingBoxHelper);
    boundingBox = null;
    boundingBoxHelper = null;
}

function updateObjectList() {
    const listContainer = document.getElementById('objectList');
    listContainer.innerHTML = '<h3>Objets dans la scène</h3>';
    const ul = document.createElement('ul');
    objectList.forEach(obj => {
        if (obj.userData.listable !== false) { // Ajoutez cette condition
            const li = document.createElement('li');
            li.textContent = obj.name;
            li.style.cursor = 'pointer';
            li.onclick = () => selectObject(obj);
            if (selectedObject === obj) {
                li.classList.add('selected');
            }
            ul.appendChild(li);
        }
    });
    listContainer.appendChild(ul);
}

function updateBoundingBox() {
    if (selectedObject && boundingBox) {
        if (boundingBoxHelper) scene.remove(boundingBoxHelper);
        
        boundingBox.setFromObject(selectedObject);
        
        boundingBoxHelper = new THREE.Box3Helper(boundingBox, 0xffff00);
        scene.add(boundingBoxHelper);
    }
}

function deleteSelectedObject() {
    if (selectedObject) {
        control.detach();
        
        scene.remove(selectedObject);
        
        const index = objectList.indexOf(selectedObject);
        if (index > -1) {
            objectList.splice(index, 1);
        }
        
        removeBoundingBox();
        
        selectedObject = null;
        
        updateObjectList();
        
        console.log("Objet supprimé");
        render();
    }
}

async function listFiles() {
    try {
        const response = await fetch('/file-list.json');
        if (!response.ok) {
            throw new Error('Erreur lors de la récupération de la liste des fichiers');
        }
        const data = await response.json();
        return data.files;
    } catch (error) {
        console.error('Erreur:', error);
        return [];
    }
}

async function displayObjectList() {
    const objectListContainer = document.createElement('div');
    objectListContainer.id = 'importObjectList';
    objectListContainer.style.position = 'absolute';
    objectListContainer.style.left = '10px';
    objectListContainer.style.top = '100px';
    objectListContainer.style.backgroundColor = 'rgba(255, 255, 255, 0.7)';
    objectListContainer.style.padding = '10px';
    objectListContainer.style.maxHeight = '300px';
    objectListContainer.style.overflowY = 'auto';

    const title = document.createElement('h3');
    title.textContent = 'Objets importables';
    objectListContainer.appendChild(title);

    const files = await listFiles();
    const ul = document.createElement('ul');
    ul.style.listStyleType = 'none';
    ul.style.padding = '0';

    files.forEach(file => {
        const li = document.createElement('li');
        li.textContent = file;
        li.style.cursor = 'pointer';
        li.style.padding = '5px';
        li.style.borderBottom = '1px solid #ccc';
        li.onclick = () => importObject(file);
        li.onmouseover = () => { li.style.backgroundColor = '#f0f0f0'; };
        li.onmouseout = () => { li.style.backgroundColor = 'transparent'; };
        ul.appendChild(li);
    });

    objectListContainer.appendChild(ul);
    document.body.appendChild(objectListContainer);
}

function importObject(filename, savedData = null) {
    // Vérifier si filename est défini, sinon utiliser un nom par défaut
    if (!filename && savedData && savedData.originalFile) {
        filename = savedData.originalFile;
    } else if (!filename) {
        console.error("Nom de fichier non défini pour l'importation");
        return;
    }

    const baseName = filename.split('_001.')[0]; // Enlève '_001' et l'extension du fichier
    let counter = 1;
    let newName = savedData ? savedData.name : `${baseName}_001`;

    // Fonction pour vérifier si un nom existe déjà dans la scène
    const nameExists = (name) => scene.getObjectByName(name) !== undefined;

    // Si le nom existe déjà, on incrémente le compteur
    while (nameExists(newName) && !savedData) {
        counter++;
        newName = `${baseName}_${counter.toString().padStart(3, '0')}`;
    }

    loader.load(
        `/geo/${filename}`,
        function (gltf) {
            const model = gltf.scene;
            model.name = newName;
            model.userData.selectable = true;
            model.userData.listable = true;
            model.userData.originalFile = filename;
            
            if (savedData) {
                model.position.fromArray(savedData.position);
                model.rotation.fromArray(savedData.rotation);
                model.scale.fromArray(savedData.scale);
            } else {
                model.position.set(0, 0, 0);
            }
            
            model.traverse((child) => {
                child.userData.selectable = true;
                child.userData.listable = true;
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            
            scene.add(model);
            objectList.push(model);
            if (!savedData) {
                selectObject(model);
            }
            updateObjectList();
            console.log("Nouvel objet importé:", model.name);
            render();
        },
        undefined,
        function (error) {
            console.error('Une erreur s\'est produite lors du chargement:', error);
        }
    );
}

// Fonction pour sauvegarder la scène
function saveScene() {
    const sceneData = {
        objects: []
    };

    scene.traverse((object) => {
        if (object.userData.selectable && object.userData.listable) {
            sceneData.objects.push({
                name: object.name,
                originalFile: object.userData.originalFile, // Ajouter cette ligne
                position: object.position.toArray(),
                rotation: object.rotation.toArray(),
                scale: object.scale.toArray()
            });
        }
    });

    const jsonString = JSON.stringify(sceneData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'scene.json';
    a.click();

    URL.revokeObjectURL(url);
}

// Fonction pour charger la scène
function loadScene() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = (event) => {
        const file = event.target.files[0];
        const reader = new FileReader();

        reader.onload = (e) => {
            const sceneData = JSON.parse(e.target.result);
            
            // Supprimer tous les objets existants de la scène
            objectList.forEach(obj => {
                if (obj.userData.selectable && obj.userData.listable) {
                    scene.remove(obj);
                }
            });
            objectList = objectList.filter(obj => !obj.userData.selectable || !obj.userData.listable);

            // Charger les objets sauvegardés
            sceneData.objects.forEach(objData => {
                importObject(objData.originalFile, objData);
            });

            updateObjectList();
            render();
        };

        reader.readAsText(file);
    };

    input.click();
}
