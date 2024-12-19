let uploadedFiles = [];
let draggedItem = null;

// Configuration de l'API
const API_URL = 'http://localhost:5000';
const MAX_FILE_SIZE = 80 * 1024 * 1024; // Nouvelle limite en octets

// Gestion du drag & drop initial
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const previewContainer = document.getElementById('preview-container');

// Fonction pour formater la taille en Mo ou Go
function formatFileSize(bytes) {
    const mo = bytes / (1024 * 1024);
    if (mo >= 1024) {
        return `${(mo / 1024).toFixed(2)} Go`;
    }
    return `${mo.toFixed(2)} Mo`;
}

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
    handleFiles(files);
});

fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    handleFiles(files);
});

function handleFiles(files) {
    // Vérifier la taille de chaque fichier
    const oversizedFiles = files.filter(file => file.size > MAX_FILE_SIZE);
    if (oversizedFiles.length > 0) {
        const fileDetails = oversizedFiles.map(file => 
            `"${file.name}" (${formatFileSize(file.size)})`
        ).join(', ');
        alert(`Les fichiers suivants dépassent la limite de ${formatFileSize(MAX_FILE_SIZE)} :\n${fileDetails}`);
        return;
    }

    uploadedFiles = [...uploadedFiles, ...files];
    updatePreview();
}

function updatePreview() {
    previewContainer.innerHTML = '';
    
    uploadedFiles.forEach((file, index) => {
        const previewItem = document.createElement('div');
        previewItem.className = 'preview-item';
        previewItem.draggable = true;
        previewItem.dataset.index = index;

        // Numéro d'ordre
        const orderNumber = document.createElement('div');
        orderNumber.className = 'order-number';
        orderNumber.textContent = index + 1;
        previewItem.appendChild(orderNumber);

        // Image
        const img = document.createElement('img');
        const reader = new FileReader();
        reader.onload = (e) => {
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
        previewItem.appendChild(img);

        // Bouton de suppression
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.innerHTML = '×';
        removeBtn.onclick = (e) => {
            e.stopPropagation();
            uploadedFiles.splice(index, 1);
            updatePreview();
        };
        previewItem.appendChild(removeBtn);

        // Événements de drag & drop pour réorganisation
        previewItem.addEventListener('dragstart', handleDragStart);
        previewItem.addEventListener('dragend', handleDragEnd);
        previewItem.addEventListener('dragover', handleDragOver);
        previewItem.addEventListener('dragenter', handleDragEnter);
        previewItem.addEventListener('dragleave', handleDragLeave);
        previewItem.addEventListener('drop', handleDrop);

        previewContainer.appendChild(previewItem);
    });
}

// Fonctions de drag & drop pour réorganisation
function handleDragStart(e) {
    draggedItem = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.index);
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    draggedItem = null;
    
    // Réinitialiser tous les styles
    const items = document.querySelectorAll('.preview-item');
    items.forEach(item => {
        item.classList.remove('drag-over');
    });
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDragEnter(e) {
    this.classList.add('drag-over');
}

function handleDragLeave(e) {
    this.classList.remove('drag-over');
}

function handleDrop(e) {
    e.stopPropagation();
    e.preventDefault();
    
    if (draggedItem === this) {
        return;
    }

    // Récupérer les indices
    const fromIndex = parseInt(draggedItem.dataset.index);
    const toIndex = parseInt(this.dataset.index);

    // Réorganiser le tableau
    const itemToMove = uploadedFiles[fromIndex];
    uploadedFiles.splice(fromIndex, 1);
    uploadedFiles.splice(toIndex, 0, itemToMove);

    // Mettre à jour l'affichage
    updatePreview();
}

// Prévisualisation du poids
document.getElementById('preview').addEventListener('click', async function() {
    try {
        const quality = document.getElementById('quality').value;
        console.log('Prévisualisation pour la qualité:', quality);
        
        const response = await fetch(`${API_URL}/preview_size?quality=${quality}`);
        console.log('Status prévisualisation:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Données prévisualisation:', data);
        
        document.getElementById('size-preview').innerText = `Poids estimé : ${data.size} Mo`;
    } catch (error) {
        console.error('Erreur lors de la prévisualisation:', error);
        alert('Erreur lors de la prévisualisation du poids: ' + error.message);
    }
});

// Création du GIF
document.getElementById('create-gif').addEventListener('click', async function() {
    if (uploadedFiles.length === 0) {
        alert('Veuillez sélectionner des images d\'abord');
        return;
    }

    const quality = document.getElementById('quality').value;
    console.log('Création du GIF avec la qualité:', quality);
    console.log('Nombre d\'images:', uploadedFiles.length);

    const formData = new FormData();
    formData.append('quality', quality);
    uploadedFiles.forEach((file, index) => {
        console.log(`Ajout de l'image ${index}:`, file.name, file.type, file.size);
        formData.append(`image_${index}`, file);
    });

    try {
        console.log('Envoi de la requête de création du GIF...');
        const response = await fetch(`${API_URL}/create_gif`, {
            method: 'POST',
            body: formData
        });

        console.log('Status de la réponse:', response.status);
        console.log('Headers:', Object.fromEntries(response.headers.entries()));

        const contentType = response.headers.get('content-type');
        console.log('Content-Type:', contentType);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Réponse d\'erreur:', errorText);
            try {
                const errorData = JSON.parse(errorText);
                throw new Error(errorData.error || `Erreur HTTP: ${response.status}`);
            } catch (e) {
                throw new Error(`Erreur HTTP: ${response.status} - ${errorText}`);
            }
        }

        const text = await response.text();
        console.log('Réponse brute:', text);
        
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            console.error('Erreur de parsing JSON:', e);
            throw new Error('Réponse invalide du serveur');
        }
        
        console.log('Données reçues:', data);
        
        if (data.path) {
            const result = document.getElementById('result');
            const gifUrl = `${API_URL}${data.path}`;
            console.log('URL du GIF:', gifUrl);
            
            result.innerHTML = `
                <h3>GIF créé avec succès!</h3>
                <img src="${gifUrl}" alt="GIF généré">
                <p>Taille : ${data.size} Mo</p>
                <a href="${gifUrl}" download="animated.gif" class="button">Télécharger le GIF</a>
            `;
        } else {
            throw new Error('Chemin du GIF manquant dans la réponse');
        }
    } catch (error) {
        console.error('Erreur lors de la création du GIF:', error);
        alert('Erreur lors de la création du GIF: ' + error.message);
    }
});

// Fonction pour télécharger le GIF
async function downloadGIF(url) {
    try {
        console.log('Téléchargement du GIF:', url);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Erreur HTTP: ${response.status}`);
        
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = 'animated.gif';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
        console.error('Erreur lors du téléchargement:', error);
        alert('Erreur lors du téléchargement: ' + error.message);
    }
}
