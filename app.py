from flask import Flask, request, jsonify, send_from_directory, make_response, current_app
from flask_cors import CORS
import os
from PIL import Image
import io
import uuid
import logging
import traceback
import time

# Configuration du logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Configuration de Flask
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, 
    static_url_path='',
    static_folder=CURRENT_DIR
)
CORS(app)

# Configuration
app.config['MAX_CONTENT_LENGTH'] = 16 * 2048 * 2048  # Limite de 16MB pour les uploads
UPLOAD_FOLDER = os.path.join(CURRENT_DIR, 'uploads')
OUTPUT_FOLDER = os.path.join(CURRENT_DIR, 'output')

# Création des dossiers nécessaires
for folder in [UPLOAD_FOLDER, OUTPUT_FOLDER]:
    if not os.path.exists(folder):
        os.makedirs(folder)

# Résolutions possibles
resolutions = {
    '360p': 360,
    '480p': 480,
    '720p': 720,
    '1080p': 1080,
    '1440p': 1440,  # 2K
    '2160p': 2160   # 4K
}

@app.route('/')
def index():
    logger.debug(f'Serving index.html from {CURRENT_DIR}')
    return send_from_directory(CURRENT_DIR, 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    logger.debug(f'Requested file: {filename}')
    if os.path.exists(os.path.join(CURRENT_DIR, filename)):
        logger.debug(f'File exists: {filename}')
        return send_from_directory(CURRENT_DIR, filename)
    logger.error(f'File not found: {filename}')
    return '', 404

@app.route('/create_gif', methods=['POST', 'OPTIONS'])
def create_gif():
    if request.method == 'OPTIONS':
        response = make_response()
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
        response.headers.add('Access-Control-Allow-Methods', 'POST')
        return response

    try:
        logger.debug('Début de la création du GIF')
        logger.debug(f'Content-Type: {request.content_type}')
        logger.debug(f'Form data: {request.form}')
        logger.debug(f'Files: {list(request.files.keys())}')

        if 'quality' not in request.form:
            return jsonify({'error': 'Qualité non spécifiée'}), 400

        quality = request.form['quality']
        if quality not in resolutions:
            return jsonify({'error': 'Qualité invalide'}), 400

        # Récupération des images
        images = []
        image_files = sorted([f for f in request.files.keys() if f.startswith('image_')])
        
        logger.debug(f'Fichiers images trouvés: {image_files}')
        
        if not image_files:
            return jsonify({'error': 'Aucune image fournie'}), 400

        for image_key in image_files:
            try:
                img_file = request.files[image_key]
                logger.debug(f'Traitement de l\'image: {image_key}, filename: {img_file.filename}')
                
                # Lecture de l'image
                img_data = img_file.read()
                if not img_data:
                    logger.error(f'Données d\'image vides pour {image_key}')
                    continue
                    
                img = Image.open(io.BytesIO(img_data))
                
                # Convertir en RGB si nécessaire
                if img.mode in ('RGBA', 'P'):
                    img = img.convert('RGB')
                
                # Redimensionner l'image
                width = height = resolutions[quality]
                img = img.resize((width, height), Image.Resampling.LANCZOS)
                images.append(img)
                
            except Exception as e:
                logger.error(f'Erreur lors du traitement de l\'image {image_key}: {str(e)}')
                logger.error(traceback.format_exc())
                continue

        if not images:
            return jsonify({'error': 'Aucune image valide n\'a été fournie'}), 400

        # Générer un nom unique pour le GIF
        gif_filename = f'gif_{uuid.uuid4().hex[:8]}.gif'
        gif_path = os.path.join(OUTPUT_FOLDER, gif_filename)
        
        logger.debug(f'Sauvegarde du GIF vers: {gif_path}')
        
        # Sauvegarder le GIF
        images[0].save(
            gif_path,
            save_all=True,
            append_images=images[1:],
            optimize=True,
            duration=500,
            loop=0
        )

        # Calculer la taille du fichier
        file_size = os.path.getsize(gif_path) / (1024 * 1024)  # Convertir en Mo
        
        response_data = {
            'message': 'GIF créé avec succès!',
            'size': round(file_size, 2),
            'path': f'/output/{gif_filename}'
        }
        logger.debug(f'Réponse: {response_data}')
        return jsonify(response_data)

    except Exception as e:
        logger.error('Erreur lors de la création du GIF:')
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/output/<filename>')
def serve_gif(filename):
    try:
        logger.debug(f'Serving GIF: {filename} from {OUTPUT_FOLDER}')
        if not os.path.exists(os.path.join(OUTPUT_FOLDER, filename)):
            logger.error(f'GIF not found: {filename}')
            return jsonify({'error': 'GIF not found'}), 404
            
        response = send_from_directory(OUTPUT_FOLDER, filename)
        response.headers['Content-Type'] = 'image/gif'
        response.headers['Content-Disposition'] = f'attachment; filename={filename}'
        return response
    except Exception as e:
        logger.error(f'Erreur lors de la lecture du GIF: {str(e)}')
        return jsonify({'error': str(e)}), 404

@app.route('/preview_size', methods=['GET'])
def preview_size():
    try:
        quality = request.args.get('quality')
        if quality not in resolutions:
            return jsonify({'error': 'Qualité invalide'}), 400
            
        size = calculate_gif_size(quality)
        return jsonify({'size': size})
    except Exception as e:
        logger.error(f'Erreur lors de la prévisualisation: {str(e)}')
        return jsonify({'error': str(e)}), 500

def calculate_gif_size(quality):
    """
    Calcule une estimation de la taille du GIF en fonction de la qualité.
    La formule prend en compte :
    - La résolution (hauteur * largeur)
    - Un facteur de compression moyen pour les GIFs (0.3)
    - 3 octets par pixel (RGB)
    Retourne la taille en Mo
    """
    resolution = resolutions.get(quality, 720)  # 720p par défaut
    pixels = resolution * resolution
    bytes_per_pixel = 3  # RGB
    compression_factor = 0.3  # Facteur de compression moyen pour les GIFs
    
    # Taille estimée en octets
    estimated_bytes = pixels * bytes_per_pixel * compression_factor
    
    # Conversion en Mo
    estimated_mb = estimated_bytes / (1024 * 1024)
    
    return round(estimated_mb, 2)

if __name__ == '__main__':
    logger.info(f'Dossier courant: {CURRENT_DIR}')
    logger.info(f'Dossier output: {OUTPUT_FOLDER}')
    logger.info(f'Fichiers dans le dossier courant: {os.listdir(CURRENT_DIR)}')
    app.run(debug=True, host='0.0.0.0', port=5000)
