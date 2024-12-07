console.log('Ontario Parks Reviews Extension Loaded');

const waitFor = (selector, timeout = 10000) => {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        
        const checkElement = () => {
            const element = typeof selector === 'string' 
                ? document.querySelector(selector)
                : selector();
                
            if (element) {
                resolve(element);
                return;
            }
            
            if (Date.now() - startTime >= timeout) {
                reject(new Error(`Timeout waiting for element: ${selector}`));
                return;
            }
            
            setTimeout(checkElement, 100);
        };
        
        checkElement();
    });
};

const { pb, initializePocketBase } = window.authService;

// Initialize auth state before starting the review system
const initReviewSystem = async () => {
    await window.authService.initializePocketBase();
    await waitFor(() => document.querySelector('.map-container'));
    
    // Get the park name from the H1 element
    const parkNameElement = document.querySelector('h1');
    const parkName = parkNameElement ? parkNameElement.textContent.replace(' - Site Map', '').trim() : 'Unknown Park';
    
    window.campsiteReviews = new CampsiteReviews(window.authService.pb, parkName);
};

// Listen for auth state changes
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'AUTH_STATE_CHANGED') {
        if (message.authData) {
            // Update auth store with new data
            window.authService.pb.authStore.save(message.authData.token, message.authData.model);
        } else {
            // Clear auth if logged out
            window.authService.pb.authStore.clear();
        }
        
        // Force reload widget if it exists
        if (window.campsiteReviews?.widget) {
            window.campsiteReviews.reloadWidget();
        }
    }
});

class CampsiteReviews {
    constructor(pb, parkName) {
        this.pb = pb;
        this.parkName = parkName;
        this.widget = null;
        this.currentImageIndex = 0;
        this.currentImages = [];
        this.currentPage = 1;
        this.reviewsPerPage = 1;
        this.init();
        this.initLightbox();
    }

    init() {
        document.addEventListener('click', (e) => {
            // Only initialize if we're on the map view (when resourceLocationId exists)
            const urlParams = new URLSearchParams(window.location.search);
            const resourceLocationId = urlParams.get('resourceLocationId');
            
            if (!resourceLocationId) return; // Exit if we're not on the map view
            
            const marker = e.target.closest('.map-icon');
            if (marker) {
                e.stopPropagation();
                const svg = marker.querySelector('svg');
                const siteId = svg?.getAttribute('data-resource');
                
                if (siteId) {
                    const parkData = {
                        mapId: urlParams.get('mapId'),
                        resourceLocationId: resourceLocationId
                    };
                    
                    this.showReviewWidget(siteId, marker, parkData);
                }
            }
        }, true);
    }

    initLightbox() {
        // Create lightbox elements
        const lightbox = document.createElement('div');
        lightbox.className = 'review-lightbox';
        lightbox.innerHTML = `
            <div class="lightbox-content">
                <img src="" alt="Full size image">
                <button class="prev-button">←</button>
                <button class="next-button">→</button>
                <button class="close-lightbox">×</button>
            </div>
        `;
        document.body.appendChild(lightbox);

        // Add event listeners
        lightbox.querySelector('.close-lightbox').addEventListener('click', () => {
            lightbox.style.display = 'none';
        });

        lightbox.querySelector('.prev-button').addEventListener('click', () => {
            this.currentImageIndex = (this.currentImageIndex - 1 + this.currentImages.length) % this.currentImages.length;
            lightbox.querySelector('img').src = this.currentImages[this.currentImageIndex];
        });

        lightbox.querySelector('.next-button').addEventListener('click', () => {
            this.currentImageIndex = (this.currentImageIndex + 1) % this.currentImages.length;
            lightbox.querySelector('img').src = this.currentImages[this.currentImageIndex];
        });

        this.lightbox = lightbox;
    }

    showLightbox(images, startIndex = 0) {
        this.currentImages = images;
        this.currentImageIndex = startIndex;
        this.lightbox.querySelector('img').src = images[startIndex];
        this.lightbox.style.display = 'flex';
    }

    async showReviewWidget(siteId, siteElement, parkData) {
        const uniqueSiteId = `${parkData.mapId}_${parkData.resourceLocationId}_${siteId}`;
        
        // Use the stored park name when creating the widget title
        const title = `${this.parkName} - Site ${siteId}`;
        
        // Remove existing widget if present
        if (this.widget) {
            this.widget.remove();
            this.widget = null;
        }

        // Create new widget
        this.widget = document.createElement('div');
        this.widget.className = 'campsite-review-widget';
        
        // Get park and campground names from the header
        const parkNameText = document.querySelector('#side-bar-info > div > div > app-side-bar-park-info > div.sidebar-content-wrapper > h2')?.textContent || '';       
       
        const campgroundText = document.getElementById('pageTitle')?.textContent || '';
      

        this.widget.innerHTML = `
            <div class="widget-header">
                <div class="site-info">
                    <h3>${parkNameText}</h3>
                    <p>${campgroundText} - Site ${siteId}</p>
                </div>
                <span class="close-widget">✕</span>
            </div>
            <div class="review-list" id="reviewList-${uniqueSiteId}">
                <div class="loading">Loading reviews...</div>
            </div>
            ${this.pb.authStore.isValid ? `
                <div class="review-form">
                    <select id="rating-${uniqueSiteId}">
                        <option value="5">★★★★★</option>
                        <option value="4">★★★★☆</option>
                        <option value="3">★★★☆☆</option>
                        <option value="2">★★☆☆☆</option>
                        <option value="1">★☆☆☆☆</option>
                    </select>
                    <div class="date-field">
                        <label for="visitDate-${uniqueSiteId}">Date Visited:</label>
                        <input 
                            type="date" 
                            id="visitDate-${uniqueSiteId}"
                            max="${new Date().toISOString().split('T')[0]}"
                        >
                    </div>
                    <textarea id="reviewText-${uniqueSiteId}" placeholder="Write your review..."></textarea>
                    <div class="image-upload">
                        <label for="images-${uniqueSiteId}">
                            Add Photos (max 5)
                            <input 
                                type="file" 
                                id="images-${uniqueSiteId}" 
                                multiple 
                                accept="image/*"
                                style="display: none;"
                            >
                        </label>
                        <div id="image-preview-${uniqueSiteId}" class="image-preview"></div>
                    </div>
                    <button id="submitReview-${uniqueSiteId}" class="submit-review">Submit Review</button>
                </div>
            ` : `
                <div class="login-prompt">
                    <p>Please login to submit reviews</p>
                    <button class="login-button">Login</button>
                </div>
            `}
        `;

        document.body.appendChild(this.widget);

        // Add event listeners
        this.widget.querySelector('.close-widget').addEventListener('click', () => {
            this.widget.remove();
            this.widget = null;
        });

        if (this.pb.authStore.isValid) {
            const imageInput = document.getElementById(`images-${uniqueSiteId}`);
            const imagePreview = document.getElementById(`image-preview-${uniqueSiteId}`);
            
            imageInput.addEventListener('change', (e) => {
                const files = Array.from(e.target.files).slice(0, 5);
                imagePreview.innerHTML = '';
                
                files.forEach(file => {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        imagePreview.innerHTML += `
                            <div class="preview-thumbnail">
                                <img src="${e.target.result}">
                                <button class="remove-image">×</button>
                            </div>
                        `;
                    };
                    reader.readAsDataURL(file);
                });
            });

            // Handle image submission
            this.widget.querySelector(`#submitReview-${uniqueSiteId}`).addEventListener('click', async () => {
                const rating = document.getElementById(`rating-${uniqueSiteId}`).value;
                const text = document.getElementById(`reviewText-${uniqueSiteId}`).value;
                const visitDate = document.getElementById(`visitDate-${uniqueSiteId}`).value;
                const imageFiles = document.getElementById(`images-${uniqueSiteId}`).files;
                
                await this.submitReview(uniqueSiteId, rating, text, visitDate, imageFiles);
            });
        }

        // Load reviews
        this.loadReviews(uniqueSiteId);
    }

    async submitReview(uniqueSiteId, rating, text, visitDate, imageFiles) {
        // Multiple strict checks for authentication
        if (!this.pb || !this.pb.authStore || !this.pb.authStore.isValid || !this.pb.authStore.token || !this.pb.authStore.model) {
            console.error('Authentication check failed:', {
                pbExists: !!this.pb,
                authStoreExists: !!this.pb?.authStore,
                isValid: this.pb?.authStore?.isValid,
                hasToken: !!this.pb?.authStore?.token,
                hasModel: !!this.pb?.authStore?.model
            });
            
            // Remove the review form and show login prompt
            if (this.widget) {
                const reviewForm = this.widget.querySelector('.review-form');
                if (reviewForm) {
                    reviewForm.innerHTML = `
                        <div class="login-prompt">
                            <p>Please login to submit reviews</p>
                            <button class="login-button">Login</button>
                        </div>
                    `;
                }
            }
            alert('Please login to submit reviews');
            return;
        }

        if (!text) {
            alert('Please write a review before submitting.');
            return;
        }

        if (!visitDate) {
            alert('Please select when you visited.');
            return;
        }

        try {
            const [parkMapId, parkLocationId, siteId] = uniqueSiteId.split('_');
            
            // Format the date to match PocketBase's expected format
            const formattedDate = new Date(visitDate);
            formattedDate.setUTCHours(0, 0, 0, 0);
            const pbDate = formattedDate.toISOString();
            
            // Create FormData for the review with images
            const formData = new FormData();
            
            // Add review data
            formData.append('park_map_id', parkMapId);
            formData.append('park_location_id', parkLocationId);
            formData.append('site_id', siteId);
            formData.append('rating', rating);
            formData.append('text', text);
            formData.append('visit_date', pbDate); // Now properly formatted
            formData.append('user', this.pb.authStore.model.id);
            
            // Add images if any
            if (imageFiles && imageFiles.length > 0) {
                Array.from(imageFiles).slice(0, 5).forEach(file => {
                    formData.append('images', file);
                });
            }

            // Create review with all data at once
            const record = await this.pb.collection('front_country_reports').create(formData);
            console.log('Created review:', record);

            // Clear form
            document.getElementById(`reviewText-${uniqueSiteId}`).value = '';
            document.getElementById(`visitDate-${uniqueSiteId}`).value = '';
            document.getElementById(`image-preview-${uniqueSiteId}`).innerHTML = '';
            document.getElementById(`images-${uniqueSiteId}`).value = '';
            
            // Reload reviews
            this.loadReviews(uniqueSiteId);
            
        } catch (error) {
            console.error('Error submitting review:', error);
            alert('Error submitting review. Please try again later.');
        }
    }

    async loadReviews(uniqueSiteId) {
        try {
            const [parkMapId, parkLocationId, siteId] = uniqueSiteId.split('_');
            
            const reviews = await this.pb.collection('front_country_reports').getList(1, 50, {
                filter: `site_id = "${siteId}"`
            });

            this.displayReviews(reviews.items, uniqueSiteId);

        } catch (error) {
            console.error('Error loading reviews:', error);
            const reviewList = document.getElementById(`reviewList-${uniqueSiteId}`);
            if (reviewList) {
                reviewList.innerHTML = '<div class="error">Error loading reviews. Please try again later.</div>';
            }
        }
    }

    displayReviews(reviews, uniqueSiteId) {
        const reviewList = document.getElementById(`reviewList-${uniqueSiteId}`);
        if (!reviewList) return;
        
        if (!reviews || reviews.length === 0) {
            reviewList.innerHTML = '<div class="no-reviews">No reviews yet. Be the first to review this campsite!</div>';
            return;
        }

        // Calculate pagination
        const totalPages = Math.ceil(reviews.length / this.reviewsPerPage);
        const startIndex = (this.currentPage - 1) * this.reviewsPerPage;
        const paginatedReviews = reviews.slice(startIndex, startIndex + this.reviewsPerPage);

        reviewList.innerHTML = `
            <div class="reviews-container">
                ${paginatedReviews.map((review, reviewIndex) => {
                    let visitDate = 'Date not provided';
                    if (review.visit_date && review.visit_date !== '') {
                        try {
                            const date = new Date(review.visit_date);
                            if (!isNaN(date.getTime())) {
                                visitDate = date.toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric'
                                });
                            }
                        } catch (e) {
                            console.error('Error formatting visit date:', e);
                        }
                    }
                    
                    const postedDate = new Date(review.created).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    });

                    return `
                        <div class="review-item">
                            <div class="review-rating">${'★'.repeat(review.rating)}${'☆'.repeat(5-review.rating)}</div>
                            <div class="review-text">${this.sanitizeHTML(review.text)}</div>
                            ${review.images?.length ? `
                                <div class="review-images">
                                    ${review.images.map((image, imageIndex) => `
                                        <div class="review-image-thumbnail" 
                                             onclick="window.campsiteReviews.showLightbox(
                                                 ${JSON.stringify(review.images.map(img => this.pb.files.getUrl(review, img)))},
                                                 ${imageIndex}
                                             )">
                                            <img src="${this.pb.files.getUrl(review, image, {thumb: '100x100'})}" alt="Review photo">
                                        </div>
                                    `).join('')}
                                </div>
                            ` : ''}
                            <div class="review-meta">
                                <span class="review-date">Visited: ${visitDate}</span>
                                <span class="review-posted">Posted: ${postedDate}</span>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
            ${totalPages > 1 ? `
                <div class="pagination">
                    <button 
                        class="prev-page" 
                        ${this.currentPage === 1 ? 'disabled' : ''}
                    >←</button>
                    <span>${this.currentPage} of ${totalPages}</span>
                    <button 
                        class="next-page"
                        ${this.currentPage === totalPages ? 'disabled' : ''}
                    >→</button>
                </div>
            ` : ''}
        `;

        // Add event listeners after creating the elements
        if (totalPages > 1) {
            const prevButton = reviewList.querySelector('.prev-page');
            const nextButton = reviewList.querySelector('.next-page');

            prevButton.addEventListener('click', () => {
                if (this.currentPage > 1) {
                    this.currentPage--;
                    this.loadReviews(uniqueSiteId);
                }
            });

            nextButton.addEventListener('click', () => {
                if (this.currentPage < totalPages) {
                    this.currentPage++;
                    this.loadReviews(uniqueSiteId);
                }
            });
        }
    }

    sanitizeHTML(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
initReviewSystem();
