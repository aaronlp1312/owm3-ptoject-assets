//  UNIFIED WEATHER APPLICATION
// Combines animation controller and weather data management
// =============================================================================

class UnifiedWeatherApp {
    constructor(config = {}) {
        // Configuration
        this.apiKey = config.apiKey || "3c511677984d2f330e332b9553c15ae7";
        this.lat = config.lat || "47.1830439";
        this.lon = config.lon || "-122.4716864";
        this.updateInterval = config.updateInterval || 300000; // 5 minutes
        
        // Weather data properties
        this.currentUnit = "F";
        this.currentData = {};
        this.searchTimeout = null;
        
        // Animation properties
        this.activeAnimations = new Set();
        this.particlePool = { snow: [], leaf: [] };
        this.maxParticles = { snow: 50, leaf: 20 };
        this.isAnimating = true;
        this.lastFrameTime = 0;
        this.frameCount = 0;
        this.cache = {};
        
        // Weather gradients for background animation
        this.weatherGradients = {
            '01d': 'linear-gradient(to bottom, #87CEEB 0%, #98D8E8 40%, #B0E0E6 100%)',
            '01n': 'linear-gradient(to bottom, #0F0F23 0%, #1a1a2e 50%, #16213e 100%)',
            '02d': 'linear-gradient(to bottom, #87CEEB 0%, #A4D3E8 60%, #C0E6F0 100%)',
            '02n': 'linear-gradient(to bottom, #1a1a2e 0%, #2d2d54 60%, #3e3e6b 100%)',
            '03d': 'linear-gradient(to bottom, #B0C4DE 0%, #D3D3D3 50%, #E0E0E0 100%)',
            '03n': 'linear-gradient(to bottom, #2F2F2F 0%, #404040 50%, #525252 100%)',
            '04d': 'linear-gradient(to bottom, #708090 0%, #A9A9A9 50%, #C0C0C0 100%)',
            '04n': 'linear-gradient(to bottom, #1C1C1C 0%, #2E2E2E 50%, #3F3F3F 100%)',
            '09d': 'linear-gradient(to bottom, #4682B4 0%, #5F9EA0 40%, #708090 100%)',
            '09n': 'linear-gradient(to bottom, #191970 0%, #2F4F4F 50%, #36454F 100%)',
            '10d': 'linear-gradient(to bottom, #4169E1 0%, #6495ED 40%, #87CEEB 100%)',
            '10n': 'linear-gradient(to bottom, #0B0B2F 0%, #1E1E3F 50%, #2F2F4F 100%)',
            '11d': 'linear-gradient(to bottom, #2F4F4F 0%, #696969 40%, #808080 100%)',
            '11n': 'linear-gradient(to bottom, #000000 0%, #1a1a1a 50%, #2d2d2d 100%)',
            '13d': 'linear-gradient(to bottom, #F0F8FF 0%, #E6E6FA 50%, #F5F5F5 100%)',
            '13n': 'linear-gradient(to bottom, #2F2F2F 0%, #4A4A4A 50%, #6B6B6B 100%)',
            '50d': 'linear-gradient(to bottom, #C0C0C0 0%, #D3D3D3 50%, #E0E0E0 100%)',
            '50n': 'linear-gradient(to bottom, #2F2F2F 0%, #3F3F3F 50%, #4F4F4F 100%)',
            'default': 'linear-gradient(to bottom, #87CEEB 0%, #98D8E8 50%, #B0E0E6 100%)'
        };
        
        this.init();
    }
    
    // INITIALIZATION
    // =============================================================================
    init() {
        this.injectCloudHTML();
        this.injectAnimationCSS();
        this.setupEventListeners();
        this.bindAnimationEvents();
        this.preloadAssets();
        this.startClock();
        this.getLocationAndFetchWeather();
        this.startUpdateLoop();
    }
    
    // EVENT LISTENERS SETUP
    // =============================================================================
    setupEventListeners() {
        // Search functionality
        const searchBtn = document.getElementById('searchBtn');
        const cityInput = document.getElementById('citySearch');
        const autoLocateBtn = document.getElementById('autoLocateBtn');
        const toggleUnitsBtn = document.getElementById('toggleUnitsBtn');

        if (searchBtn) {
            searchBtn.addEventListener('click', () => this.handleSearch());
        }

        if (cityInput) {
            cityInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.handleSearch();
                }
            });

            cityInput.addEventListener('input', (e) => {
                this.debouncedSearch(e.target.value);
            });

            cityInput.addEventListener('focus', () => {
                cityInput.style.borderColor = 'rgba(255, 255, 255, 0.8)';
            });

            cityInput.addEventListener('blur', () => {
                cityInput.style.borderColor = 'rgba(255, 255, 255, 0.5)';
            });
        }

        if (autoLocateBtn) {
            autoLocateBtn.addEventListener('click', () => this.getLocationAndFetchWeather());
        }

        if (toggleUnitsBtn) {
            toggleUnitsBtn.addEventListener('click', () => this.toggleUnits());
        }
    }
    
    bindAnimationEvents() {
        this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
        this.handleResize = this.debounce(this.handleResize.bind(this), 250);

        document.addEventListener('visibilitychange', this.handleVisibilityChange);
        window.addEventListener('resize', this.handleResize);
        window.addEventListener('beforeunload', () => this.cleanup());
    }
    
    // WEATHER DATA METHODS
    // =============================================================================
    
    // Debounced search function
    debouncedSearch(query) {
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }

        if (query.trim().length < 2) {
            return;
        }

        this.searchTimeout = setTimeout(() => {
            this.performSearch(query.trim());
        }, 800);
    }

    // Handle immediate search
    handleSearch() {
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
            this.searchTimeout = null;
        }

        const cityInput = document.getElementById('citySearch');
        const query = cityInput?.value.trim();

        if (!query) return;
        this.performSearch(query);
    }

    // Perform the actual search
    async performSearch(query) {
        this.showLoadingState();

        try {
            const isZipcode = /^\d{5}$/.test(query);

            if (isZipcode) {
                const success = await this.searchByZipcode(query);
                if (!success) {
                    this.showError('Zipcode not found. Please try again.');
                }
            } else {
                await this.searchByCity(query);
            }
        } catch (error) {
            console.error('Search error:', error);
            this.showError('Search failed. Please try again.');
        } finally {
            this.hideLoadingState();
        }
    }

    // Get user location using IP geolocation
    async getLocationAndFetchWeather() {
        try {
            const response = await fetch('https://ipinfo.io/json');
            const data = await response.json();
            const [lat, lon] = data.loc.split(',');
            await this.fetchAllWeatherData(parseFloat(lat), parseFloat(lon));
        } catch (error) {
            console.error('Error getting location:', error);
            await this.fetchAllWeatherData(47.2529, -122.4443);
        }
    }

    // Search by city name
    async searchByCity(cityName) {
        try {
            const response = await fetch(
                `http://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(cityName)}&limit=1&appid=${this.apiKey}`
            );
            const data = await response.json();

            if (data.length > 0) {
                const { lat, lon } = data[0];
                await this.fetchAllWeatherData(lat, lon);
                return true;
            } else {
                this.showError('City not found. Please try again.');
                return false;
            }
        } catch (error) {
            console.error('Error searching city:', error);
            this.showError('Error searching for city.');
            return false;
        }
    }

    // Search by zipcode
    async searchByZipcode(zipcode, countryCode = 'US') {
        try {
            const response = await fetch(
                `http://api.openweathermap.org/geo/1.0/zip?zip=${zipcode},${countryCode}&appid=${this.apiKey}`
            );
            const data = await response.json();

            if (data.lat && data.lon) {
                await this.fetchAllWeatherData(data.lat, data.lon);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error searching by zipcode:', error);
            return false;
        }
    }

    // Reverse geocoding
    async reverseGeocode(lat, lon) {
        try {
            const response = await fetch(
                `http://api.openweathermap.org/geo/1.0/reverse?lat=${lat}&lon=${lon}&limit=2&appid=${this.apiKey}`
            );
            const data = await response.json();

            if (data.length > 0) {
                return {
                    city: data[0].name,
                    state: data[0].state || '',
                    country: data[0].country
                };
            }
            return { city: 'Unknown', state: '', country: '' };
        } catch (error) {
            console.error('Error reverse geocoding:', error);
            return { city: 'Unknown', state: '', country: '' };
        }
    }

    // Fetch all weather data - MAIN DATA METHOD
    async fetchAllWeatherData(lat, lon) {
        try {
            // Update coordinates for animation controller
            this.lat = lat;
            this.lon = lon;
            
            // Get location name
            const location = await this.reverseGeocode(lat, lon);

            // Fetch weather data
            const weatherResponse = await fetch(
                `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&appid=${this.apiKey}&units=imperial`
            );
            const weatherData = await weatherResponse.json();

            // Fetch air pollution data
            const pollutionResponse = await fetch(
                `http://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${this.apiKey}`
            );
            const pollutionData = await pollutionResponse.json();

            // Store current data
            this.currentData = {
                location,
                weather: weatherData,
                pollution: pollutionData,
                coordinates: { lat, lon }
            };

            // Update UI elements
            this.updateCurrentWeather();
            this.updateHourlyForecast();
            this.updateDailyForecast();
            this.updateAirPollution();
            this.updateWeatherAlerts();
            this.updateBackground();
            this.checkRoadHazards();
            
            // Update animations based on current weather
            this.updateWeatherScene();

            // Clear search input
            const cityInput = document.getElementById('citySearch');
            if (cityInput) {
                cityInput.value = '';
            }

        } catch (error) {
            console.error('Error fetching weather data:', error);
            this.showError('Error fetching weather data.');
        }
    }
    
    // ANIMATION METHODS
    // =============================================================================
    
    // 🌥️ Inject cloud HTML structure
    injectCloudHTML() {
        if (document.getElementById('clouds')) return;

        const cloudHTML = `
        <div id="clouds" style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 5;
            opacity: 0;
            transition: all 2s ease;
        ">
            <div class="cloud cloud-1" style="
                position: absolute;
                background: linear-gradient(to bottom, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.4) 100%);
                border-radius: 50px;
                width: 100px;
                height: 40px;
                top: 10%;
                left: 10%;
                animation: float-cloud 20s ease-in-out infinite;
            ">
                <div style="
                    position: absolute;
                    background: linear-gradient(to bottom, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.5) 100%);
                    border-radius: 50px;
                    width: 60px;
                    height: 60px;
                    top: -30px;
                    left: 10px;
                "></div>
                <div style="
                    position: absolute;
                    background: linear-gradient(to bottom, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.5) 100%);
                    border-radius: 50px;
                    width: 80px;
                    height: 50px;
                    top: -20px;
                    right: 10px;
                "></div>
            </div>
            
            <div class="cloud cloud-2" style="
                position: absolute;
                background: linear-gradient(to bottom, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.3) 100%);
                border-radius: 60px;
                width: 120px;
                height: 50px;
                top: 20%;
                right: 15%;
                animation: float-cloud 25s ease-in-out infinite reverse;
            ">
                <div style="
                    position: absolute;
                    background: linear-gradient(to bottom, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.4) 100%);
                    border-radius: 50px;
                    width: 70px;
                    height: 70px;
                    top: -35px;
                    left: 20px;
                "></div>
                <div style="
                    position: absolute;
                    background: linear-gradient(to bottom, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.4) 100%);
                    border-radius: 50px;
                    width: 50px;
                    height: 50px;
                    top: -25px;
                    right: 20px;
                "></div>
            </div>
            
            <div class="cloud cloud-3" style="
                position: absolute;
                background: linear-gradient(to bottom, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.2) 100%);
                border-radius: 40px;
                width: 80px;
                height: 30px;
                top: 30%;
                left: 50%;
                transform: translateX(-50%);
                animation: float-cloud 30s ease-in-out infinite;
            ">
                <div style="
                    position: absolute;
                    background: linear-gradient(to bottom, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.3) 100%);
                    border-radius: 50px;
                    width: 50px;
                    height: 50px;
                    top: -25px;
                    left: 15px;
                "></div>
            </div>
        </div>
        `;

        document.body.insertAdjacentHTML('afterbegin', cloudHTML);
    }
    
    // Enhanced weather scene orchestrator
    async updateWeatherScene() {
        if (!this.currentData.weather) return;
        
        try {
            const current = this.currentData.weather.current;
            const iconCode = current.weather[0].icon;
            const condition = current.weather[0].main;
            const windSpeed = current.wind_speed;

            // Update visual elements
            this.setCSSBackgrounds(iconCode);
            this.updateCloudSystem(iconCode, condition);
            this.updateCelestialDisplay(iconCode, condition);
            this.updateWeatherEffects(iconCode, windSpeed);

            // Animate stars at night
            if (iconCode.endsWith('n')) {
                this.animateStars();
            }

            console.log(`Weather scene updated: ${condition} (${iconCode})`);

        } catch (error) {
            console.error("Weather scene update failed:", error);
        }
    }
    
    // Enhanced gradient application
    setCSSBackgrounds(iconCode) {
        const sky = document.getElementById("sky");
        if (!sky) return;

        const gradient = this.weatherGradients[iconCode] || this.weatherGradients.default;

        if (sky.dataset.currentGradient === gradient) return;

        sky.style.background = gradient;
        sky.style.transition = "background 2s cubic-bezier(0.4, 0, 0.2, 1)";
        sky.dataset.currentGradient = gradient;
    }
    
    // Enhanced cloud system
    updateCloudSystem(iconCode, condition) {
        const cloudContainer = document.getElementById("clouds");
        if (!cloudContainer) return;

        const cloudConfigs = {
            '01d': { opacity: 0, filter: 'none' },
            '01n': { opacity: 0, filter: 'none' },
            '02d': { opacity: 0.3, filter: 'brightness(1.2) contrast(0.9)' },
            '02n': { opacity: 0.4, filter: 'brightness(0.6) contrast(1.1)' },
            '03d': { opacity: 0.6, filter: 'brightness(0.9) contrast(1.0)' },
            '03n': { opacity: 0.7, filter: 'brightness(0.4) contrast(1.2)' },
            '04d': { opacity: 0.8, filter: 'brightness(0.7) contrast(1.1)' },
            '04n': { opacity: 0.9, filter: 'brightness(0.3) contrast(1.3)' },
            '09d': { opacity: 0.9, filter: 'brightness(0.5) contrast(1.3) saturate(0.8)' },
            '09n': { opacity: 0.95, filter: 'brightness(0.2) contrast(1.4) saturate(0.7)' },
            '10d': { opacity: 0.85, filter: 'brightness(0.6) contrast(1.2) saturate(0.9)' },
            '10n': { opacity: 0.9, filter: 'brightness(0.25) contrast(1.3) saturate(0.8)' },
            '11d': { opacity: 1, filter: 'brightness(0.3) contrast(1.5) saturate(0.6)' },
            '11n': { opacity: 1, filter: 'brightness(0.1) contrast(1.6) saturate(0.5)' },
            '13d': { opacity: 0.5, filter: 'brightness(1.4) contrast(0.8) saturate(0.3)' },
            '13n': { opacity: 0.6, filter: 'brightness(0.8) contrast(1.0) saturate(0.4)' },
            '50d': { opacity: 0.8, filter: 'brightness(0.8) contrast(0.7) blur(2px)' },
            '50n': { opacity: 0.9, filter: 'brightness(0.4) contrast(0.9) blur(3px)' }
        };

        const config = cloudConfigs[iconCode] || { opacity: 0.5, filter: 'brightness(0.8)' };

        if (typeof gsap !== 'undefined') {
            gsap.to(cloudContainer, {
                opacity: config.opacity,
                filter: config.filter,
                duration: 2,
                ease: "power2.out"
            });
        } else {
            cloudContainer.style.opacity = config.opacity;
            cloudContainer.style.filter = config.filter;
            cloudContainer.style.transition = "all 2s ease";
        }
    }
    
    // Enhanced celestial display
    updateCelestialDisplay(iconCode, condition) {
        const sun = document.getElementById("sun");
        const moon = document.getElementById("moon");
        if (!sun || !moon) return;

        const sunConfig = this.getSunConfiguration(iconCode, condition);
        const isNight = iconCode.endsWith("n");

        // Animate sun
        if (sunConfig.visible) {
            sun.style.display = "block";
            if (typeof gsap !== 'undefined') {
                gsap.to(sun, {
                    filter: sunConfig.filter,
                    opacity: sunConfig.opacity,
                    duration: 1.5,
                    ease: "power2.out"
                });
            } else {
                sun.style.filter = sunConfig.filter;
                sun.style.opacity = sunConfig.opacity;
                sun.style.transition = "all 1.5s ease";
            }
        } else {
            if (typeof gsap !== 'undefined') {
                gsap.to(sun, {
                    opacity: 0,
                    duration: 1,
                    onComplete: () => sun.style.display = "none"
                });
            } else {
                sun.style.opacity = "0";
                sun.style.transition = "opacity 1s ease";
                setTimeout(() => sun.style.display = "none", 1000);
            }
        }

        // Handle moon
        if (isNight) {
            moon.style.display = "block";
            if (typeof gsap !== 'undefined') {
                gsap.to(moon, { opacity: 1, duration: 1.5 });
            } else {
                moon.style.opacity = "1";
                moon.style.transition = "opacity 1.5s ease";
            }
        } else {
            if (typeof gsap !== 'undefined') {
                gsap.to(moon, {
                    opacity: 0,
                    duration: 1,
                    onComplete: () => moon.style.display = "none"
                });
            } else {
                moon.style.opacity = "0";
                moon.style.transition = "opacity 1s ease";
                setTimeout(() => moon.style.display = "none", 1000);
            }
        }
    }
    
    // PARTICLE SYSTEM METHODS
    // =============================================================================
    
    // Spawn particles based on weather conditions
    spawnParticles(type, count = 20) {
        if (!this.isAnimating) return;

        const config = this.getParticleConfig(type);
        if (!config) return;

        const existing = document.querySelectorAll(`.${config.class}`).length;
        if (existing >= this.maxParticles[type]) return;

        for (let i = 0; i < Math.min(count, this.maxParticles[type] - existing); i++) {
            this.createParticle(config);
        }
    }

    // Get particle configuration
    getParticleConfig(type) {
        const configs = {
            snow: {
                src: "/storage/emulated/0/AutoTools/Gpicon/snowflake.png",
                class: "flake",
                fallSpeed: { min: 8, max: 15 },
                drift: { min: -50, max: 50 },
                size: { min: 10, max: 20 }
            },
            leaf: {
                src: "/storage/emulated/0/AutoTools/Gpicon/leaf.png",
                class: "leaf",
                fallSpeed: { min: 5, max: 10 },
                drift: { min: -200, max: 200 },
                size: { min: 15, max: 25 }
            },
            rain: {
                src: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMiIgaGVpZ2h0PSIyMCIgdmlld0JveD0iMCAwIDIgMjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxsaW5lIHgxPSIxIiB5MT0iMCIgeDI9IjEiIHkyPSIyMCIgc3Ryb2tlPSIjNEE5MEU2IiBzdHJva2Utd2lkdGg9IjIiLz4KPC9zdmc+",
                class: "raindrop",
                fallSpeed: { min: 15, max: 25 },
                drift: { min: -10, max: 10 },
                size: { min: 2, max: 4 }
            }
        };
        return configs[type];
    }

    // Create individual particle
    createParticle(config) {
        const el = document.createElement("img");
        el.src = config.src;
        el.className = config.class;
        el.style.position = "absolute";
        el.style.pointerEvents = "none";
        el.style.left = `${Math.random() * window.innerWidth}px`;
        el.style.top = `-30px`;
        el.style.width = `${config.size.min + Math.random() * (config.size.max - config.size.min)}px`;
        el.style.height = "auto";
        el.style.zIndex = "10";

        document.body.appendChild(el);

        const duration = config.fallSpeed.min + Math.random() * (config.fallSpeed.max - config.fallSpeed.min);
        const drift = config.drift.min + Math.random() * (config.drift.max - config.drift.min);

        if (typeof gsap !== 'undefined') {
            const animation = gsap.to(el, {
                y: window.innerHeight + 50,
                x: `+=${drift}`,
                rotation: config.class === 'leaf' ? "+=360" : config.class === 'raindrop' ? 0 : "+=180",
                duration: duration,
                ease: config.class === 'leaf' ? "power1.inOut" : "linear",
                onComplete: () => {
                    el.remove();
                    this.activeAnimations.delete(animation);
                }
            });
            this.activeAnimations.add(animation);
        } else {
            el.style.animation = `fall-${config.class} ${duration}s linear forwards`;
            setTimeout(() => el.remove(), duration * 1000);
        }
    }

    // Enhanced weather effects
    updateWeatherEffects(iconCode, windSpeed = 5) {
        const conditions = this.getWeatherConditions(iconCode);

        if (conditions.rain) {
            this.spawnParticles("rain", Math.min(40, Math.floor(windSpeed * 3)));
        }

        if (conditions.snow) {
            this.spawnParticles("snow", Math.min(25, Math.floor(windSpeed * 1.5)));
        }

        if (conditions.wind && windSpeed > 10) {
            this.spawnParticles("leaf", Math.min(15, Math.floor(windSpeed / 2)));
        }

        if (conditions.fog) {
            this.applyFogOverlay(iconCode);
        }

        if (conditions.lightning) {
            this.updateLightningOverlay(iconCode);
        }
    }
    
    // UI UPDATE METHODS
    // =============================================================================
    
    // Update current weather display
    updateCurrentWeather() {
        const { location, weather } = this.currentData;
        const current = weather.current;

        // Location
        this.setText('city', `${location.city}${location.state ? ', ' + location.state : ''}`);
        this.setText('country', location.country);

        // Temperature
        const tempF = Math.round(current.temp);
        const tempC = Math.round((tempF - 32) * 5 / 9);
        const feelsF = Math.round(current.feels_like);
        const feelsC = Math.round((feelsF - 32) * 5 / 9);

        this.currentData.tempF = tempF;
        this.currentData.tempC = tempC;
        this.currentData.feelsF = feelsF;
        this.currentData.feelsC = feelsC;

        this.setText('temp', this.currentUnit === 'F' ? tempF : tempC);
        this.setText('feelsLike', this.currentUnit === 'F' ? feelsF : feelsC);
        this.setText('unit', `°${this.currentUnit}`);

        // Weather details
        this.setText('description', current.weather[0].description);
        this.setText('humidity', `${current.humidity}%`);
        this.setText('windSpeed', `${Math.round(current.wind_speed)} mph`);
        this.setText('pressure', `${current.pressure} hPa`);
        this.setText('uvIndex', Math.round(current.uvi));
        this.setText('visibility', `${(current.visibility / 1000).toFixed(1)} km`);
        this.setText('dewPoint', `${Math.round(current.dew_point)}°`);
        this.setText('clouds', `${current.clouds}%`);

        // Additional details
        this.setText('windGust', current.wind_gust ? `${Math.round(current.wind_gust)} mph` : 'N/A');
        this.setText('windDirection', `${current.wind_deg}°`);
        this.setText('windCompass', this.getCompassDirection(current.wind_deg));

        // Daily data
        if (weather.daily && weather.daily[0]) {
            const daily = weather.daily[0];
            this.setText('rainChance', `${Math.round((daily.pop || 0) * 100)}%`);
            this.setText('moonrise', new Date(daily.moonrise * 1000).toLocaleTimeString());
            this.setText('moonset', new Date(daily.moonset * 1000).toLocaleTimeString());
            this.setText('moonPhaseName', this.getMoonPhaseName(daily.moon_phase));

            const nightLength = daily.moonset && daily.moonrise
                ? this.formatDuration((daily.moonset - daily.moonrise) * 1000)
                : 'N/A';
            this.setText('nightLength', nightLength);
        }

        // Day length
        const dayLength = current.sunrise && current.sunset
            ? this.formatDuration((current.sunset - current.sunrise) * 1000)
            : 'N/A';
        this.setText('dayLength', dayLength);

        // Weather icon
        const iconElement = document.getElementById('weatherIcon');
        if (iconElement) {
            iconElement.className = `wi wi-owm-${current.weather[0].id}`;
        }

        // Sunrise/Sunset
        this.setText('sunrise', new Date(current.sunrise * 1000).toLocaleTimeString());
        this.setText('sunset', new Date(current.sunset * 1000).toLocaleTimeString());

        // Daily high/low
        if (weather.daily && weather.daily[0]) {
            this.setText('temp_max', Math.round(weather.daily[0].temp.max));
            this.setText('temp_min', Math.round(weather.daily[0].temp.min));
        }
    }

    // Update hourly forecast
    updateHourlyForecast() {
        const { weather } = this.currentData;
        const hourly = weather.hourly || [];

        const hourlyGrid = document.querySelector('.hourly-grid');
        if (hourlyGrid) {
            hourlyGrid.innerHTML = hourly.slice(0, 12).map(hour => `
                <div class="hourly-item">
                    <div class="time">${this.formatTime(hour.dt)}</div>
                    <div class="svg-wrap"><i class="${this.getWeatherIconClass(hour.weather?.[0]?.icon)}"></i></div>
                    <p>${Math.round(hour.temp)}°${this.currentUnit}</p>
                    <p>${hour.weather?.[0]?.main}</p>
                </div>
            `).join('');
        }
    }

    // Update daily forecast
    updateDailyForecast() {
        const { weather } = this.currentData;
        const daily = weather.daily || [];

        const dailyList = document.querySelector('.forecast-list');
        if (dailyList) {
            dailyList.innerHTML = daily.slice(0, 7).map(day => `
                <li>
                    <div class="forecast-day">
                        <div class="forecast-left">
                            <div class="forecast-date">${new Date(day.dt * 1000).toLocaleDateString(undefined, { weekday: 'short' })}</div>
                            <i class="${this.getWeatherIconClass(day.weather?.[0]?.icon)}"></i>
                            <div class="forecast-temp">${Math.round(day.temp.max)}°</div>
                        </div>
                        <div class="forecast-info">
                            <div class="forecast-desc">${day.weather?.[0]?.description}</div>
                            <div class="range">
                                <span class="low">${Math.round(day.temp.min)}°${this.currentUnit}</span>
                                <div class="meter"></div>
                                <span class="high">${Math.round(day.temp.max)}°${this.currentUnit}</span>
                            </div>
                            <div class="forecast-sun">
                                <i class="wi wi-sunrise"></i> ${this.formatTime(day.sunrise)}
                                <i class="wi wi-sunset"></i> ${this.formatTime(day.sunset)}
                            </div>
                        </div>
                    </div>
                </li>
            `).join('');
        }
    }

    // Update air pollution data
    updateAirPollution() {
        const pollution = this.currentData.pollution;
        if (!pollution || !pollution.list || !pollution.list[0]) return;

        const aqi = pollution.list[0].main.aqi;
        const components = pollution.list[0].components;

        const aqiLabels = ['', 'Good', 'Fair', 'Moderate', 'Poor', 'Very Poor'];
        const aqiColors = ['', '#00e400', '#ffff00', '#ff7e00', '#ff0000', '#8f3f97'];

        this.setText('aqi', `${aqi} (${aqiLabels[aqi]})`);
        this.setText('co', `${components.co} μg/m³`);
        this.setText('no2', `${components.no2} μg/m³`);
        this.setText('o3', `${components.o3} μg/m³`);
        this.setText('pm2_5', `${components.pm2_5} μg/m³`);
        this.setText('pm10', `${components.pm10} μg/m³`);

        const aqiElement = document.getElementById('aqi');
        if (aqiElement) {
            aqiElement.style.color = aqiColors[aqi];
        }

        this.updateEnvironmentalSummary(aqi, components);
    }

    // Update environmental summary
    updateEnvironmentalSummary(aqi, components) {
        const summaryElement = document.getElementById('environmentalSummary');
        if (!summaryElement) return;

        const healthSummary = this.getPollutionHealthSummary(aqi);
        const worstPollutant = this.getWorstPollutant(components);
        const uvData = this.getUVIndexData(this.currentData.weather.current.uvi);
        const visibilityData = this.getVisibilityData(this.currentData.weather.current.visibility / 1000);

        summaryElement.innerHTML = `
        <div class="env-summary">
            <h3>Environmental Summary</h3>
            <div class="health-advice">
                <p><strong>Air Quality:</strong> ${healthSummary}</p>
                <p><strong>Primary Concern:</strong> ${worstPollutant.label} (${worstPollutant.value} μg/m³)</p>
                <p><strong>UV Index:</strong> ${uvData.label} - ${uvData.message}</p>
                <p><strong>Visibility:</strong> ${visibilityData.label} - ${visibilityData.message}</p>
            </div>
        </div>
        `;
    }

    // Update weather alerts
    updateWeatherAlerts() {
        const alerts = this.currentData.weather.alerts || [];
        const container = document.getElementById('weatherAlerts');

        if (!container) return;

        if (alerts.length > 0) {
            container.innerHTML = alerts.map(alert => `
                <div class="alert">
                    <strong>⚠️ ${alert.event}</strong>
                    <p>${alert.description}</p>
                    <small>From: ${new Date(alert.start * 1000).toLocaleString()}</small>
                </div>
            `).join('');
            container.style.display = 'block';
        } else {
            container.style.display = 'none';
        }
    }

    // Check road hazards
    checkRoadHazards() {
        const current = this.currentData.weather.current;
        const temp = current.temp;
        const windSpeed = current.wind_speed;
        const visibility = current.visibility;
        const precipitation = current.rain?.['1h'] || current.snow?.['1h'] || 0;

        let hazards = [];

        if (temp <= 32 && precipitation > 0) {
            hazards.push("⚠️ Ice Warning: Roads may be slippery!");
        }
        if (temp < 20) {
            hazards.push("❄️ Extreme Cold: Drive cautiously!");
        }
        if (windSpeed > 40) {
            hazards.push("💨 High Wind Warning: Keep both hands on the wheel!");
        }
        if (visibility < 500) {
            hazards.push("🌫 Low Visibility: Use fog lights & slow down!");
        }
        if (precipitation > 0.5) {
            hazards.push("🌧 Heavy Rain: Risk of hydroplaning!");
        }

        const container = document.getElementById('roadAlerts');
        if (container) {
            if (hazards.length > 0) {
                container.innerHTML = hazards.map(hazard => `<div class="road-alert">${hazard}</div>`).join('');
                container.style.display = 'block';
            } else {
                container.style.display = 'none';
            }
        }
    }

    // Toggle temperature units
    toggleUnits() {
        this.currentUnit = this.currentUnit === 'F' ? 'C' : 'F';

        if (this.currentData.tempF !== undefined) {
            this.setText('temp', this.currentUnit === 'F' ? this.currentData.tempF : this.currentData.tempC);
            this.setText('feelsLike', this.currentUnit === 'F' ? this.currentData.feelsF : this.currentData.feelsC);
            this.setText('unit', `°${this.currentUnit}`);

            this.updateHourlyForecast();
            this.updateDailyForecast();
        }
    }

    // Update background based on time of day
    updateBackground() {
        const hour = new Date().getHours();
        const body = document.body;
        body.className = "";

        if (hour >= 5 && hour < 8) body.classList.add("dawn");
        else if (hour >= 8 && hour < 12) body.classList.add("morning");
        else if (hour >= 12 && hour < 15) body.classList.add("afternoon-1");
        else if (hour >= 15 && hour < 18) body.classList.add("afternoon-2");
        else if (hour >= 18 && hour < 20) body.classList.add("evening-1");
        else if (hour >= 20 && hour < 22) body.classList.add("evening-2");
        else if (hour >= 22 || hour < 2) body.classList.add("night-1");
        else body.classList.add("night-2");
    }

    // Start clock
    startClock() {
        const updateTime = () => {
            const now = new Date();
            this.setText('currentDay', now.toLocaleDateString(undefined, { weekday: 'long' }));
            this.setText('currentTime', now.toLocaleTimeString());
        };

        updateTime();
        setInterval(updateTime, 1000);
    }
    
    // ANIMATION HELPER METHODS
    // =============================================================================
    
    // Get sun configuration
    getSunConfiguration(iconCode, condition) {
        const configs = {
            '01d': { visible: true, filter: 'none', opacity: '1' },
            '02d': { visible: true, filter: 'brightness(0.9)', opacity: '0.9' },
            '03d': { visible: true, filter: 'brightness(0.7) contrast(0.9)', opacity: '0.7' },
            '04d': { visible: true, filter: 'brightness(0.5) contrast(0.8)', opacity: '0.5' },
            '09d': { visible: true, filter: 'brightness(0.4) contrast(0.9)', opacity: '0.4' },
            '10d': { visible: true, filter: 'brightness(0.3) contrast(0.8)', opacity: '0.3' },
            '11d': { visible: true, filter: 'brightness(0.2) contrast(1.2)', opacity: '0.2' },
            '13d': { visible: true, filter: 'brightness(1.2) contrast(0.7)', opacity: '0.8' },
            '50d': { visible: true, filter: 'brightness(0.4) blur(2px)', opacity: '0.4' }
        };

        return configs[iconCode] || { visible: false, filter: 'none', opacity: '0' };
    }

    // Get weather conditions
    getWeatherConditions(iconCode) {
        return {
            clouds: ["02d", "02n", "03d", "03n", "04d", "04n"].includes(iconCode),
            rain: ["09d", "09n", "10d", "10n"].includes(iconCode),
            snow: iconCode.includes("13"),
            fog: iconCode.includes("50"),
            wind: true,
            lightning: iconCode.startsWith("11"),
        };
    }

    // Lightning overlay
    updateLightningOverlay(iconCode) {
        const thunder = document.getElementById("thunder");
        const isStorm = iconCode.startsWith("11");
        if (!thunder) return;

        if (isStorm && typeof gsap !== 'undefined') {
            const strikes = 2 + Math.floor(Math.random() * 4);
            let delay = 0;

            for (let i = 0; i < strikes; i++) {
                delay += Math.random() * 3000 + 1000;
                
                setTimeout(() => {
                    gsap.fromTo(thunder, 
                        { opacity: 0 }, 
                        {
                            opacity: 0.8 + Math.random() * 0.2,
                            duration: 0.1 + Math.random() * 0.1,
                            repeat: 1 + Math.floor(Math.random() * 3),
                            yoyo: true,
                            ease: "power2.inOut",
                            onComplete: () => gsap.set(thunder, { opacity: 0 })
                        }
                    );
                }, delay);
            }
        } else {
            if (typeof gsap !== 'undefined') {
                gsap.set(thunder, { opacity: 0 });
            } else {
                thunder.style.opacity = "0";
            }
        }
    }

    // Fog overlay
    applyFogOverlay(iconCode) {
        const fog = document.getElementById("fog");
        if (!fog) return;

        const isFoggy = iconCode.includes("50");
        const targetOpacity = isFoggy ? 0.7 : 0;

        if (typeof gsap !== 'undefined') {
            gsap.to(fog, { 
                opacity: targetOpacity, 
                duration: 3, 
                ease: "sine.inOut" 
            });

            if (isFoggy) {
                gsap.to(fog, {
                    x: "+=20",
                    duration: 10,
                    ease: "sine.inOut",
                    yoyo: true,
                    repeat: -1
                });
            }
        } else {
            fog.style.opacity = targetOpacity;
            fog.style.transition = "opacity 3s ease";
        }
    }

    // Animate stars
    animateStars() {
        const stars = document.querySelectorAll('.star');
        if (stars.length === 0) return;

        stars.forEach((star, i) => {
            if (typeof gsap !== 'undefined') {
                const animation = gsap.to(star, {
                    opacity: 0.3 + Math.random() * 0.7,
                    duration: 0.5 + Math.random() * 2,
                    delay: i * 0.1,
                    yoyo: true,
                    repeat: -1,
                    ease: "sine.inOut"
                });
                this.activeAnimations.add(animation);
            }
        });
    }
    
    // PERFORMANCE & EVENT HANDLERS
    // =============================================================================
    
    handleVisibilityChange() {
        if (document.hidden) {
            this.pauseAnimations();
        } else {
            this.resumeAnimations();
            this.updateWeatherScene();
        }
    }

    handleResize() {
        this.clearParticles();
        if (this.currentData.weather) {
            const iconCode = this.currentData.weather.current.weather[0].icon;
            const windSpeed = this.currentData.weather.current.wind_speed;
            this.updateWeatherEffects(iconCode, windSpeed);
        }
    }

    // Start update loop
    startUpdateLoop() {
        this.intervalId = setInterval(() => {
            if (!document.hidden) {
                this.getLocationAndFetchWeather();
            }
        }, this.updateInterval);
    }

    // Animation control
    pauseAnimations() {
        this.isAnimating = false;
        if (typeof gsap !== 'undefined') {
            gsap.globalTimeline.pause();
        }
    }

    resumeAnimations() {
        this.isAnimating = true;
        if (typeof gsap !== 'undefined') {
            gsap.globalTimeline.resume();
        }
    }

    // Clear particles
    clearParticles() {
        document.querySelectorAll('.flake, .leaf, .raindrop').forEach(el => el.remove());
    }

    // Cleanup
    cleanup() {
        clearInterval(this.intervalId);
        this.activeAnimations.forEach(animation => {
            if (typeof gsap !== 'undefined' && animation.kill) {
                animation.kill();
            }
        });
        this.activeAnimations.clear();
        this.clearParticles();

        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        window.removeEventListener('resize', this.handleResize);
    }
    
    // LOADING & ERROR HANDLING
    // =============================================================================
    
    showLoadingState() {
        const searchBtn = document.getElementById('searchBtn');
        if (searchBtn) {
            searchBtn.innerHTML = '<span class="material-symbols-outlined">hourglass_empty</span>';
            searchBtn.disabled = true;
        }
    }

    hideLoadingState() {
        const searchBtn = document.getElementById('searchBtn');
        if (searchBtn) {
            searchBtn.innerHTML = '<span class="material-symbols-outlined">search</span>';
            searchBtn.disabled = false;
        }
    }

    showError(message) {
        const errorElement = document.getElementById('errorMessage');
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.display = 'block';
            setTimeout(() => {
                errorElement.style.display = 'none';
            }, 5000);
        } else {
            console.error(message);
        }
    }
    
    // CACHING SYSTEM
    // =============================================================================
    
    setCache(key, data) {
        if (!this.cache) this.cache = {};
        this.cache[key] = data;
    }

    getFromCache(key, maxAge) {
        if (!this.cache || !this.cache[key]) return null;

        const cached = this.cache[key];
        if (cached && (Date.now() - cached.timestamp) < maxAge) {
            return cached;
        }
        return null;
    }
    
    // DATA HELPER FUNCTIONS
    // =============================================================================
    
    getUVIndexData(uvi) {
        if (uvi <= 2) return { label: "Low", color: "#3EA72D", message: "Safe to be outside." };
        if (uvi <= 5) return { label: "Moderate", color: "#FFF300", message: "Wear sunglasses if staying out." };
        if (uvi <= 7) return { label: "High", color: "#F18B00", message: "Use SPF 30+, seek shade." };
        if (uvi <= 10) return { label: "Very High", color: "#E53210", message: "Cover up and avoid peak sun." };
        return { label: "Extreme", color: "#B567A4", message: "Avoid going out unless essential." };
    }

    getVisibilityData(km) {
        if (km >= 10) return { label: "Excellent", color: "#00e400", message: "Clear and open views." };
        if (km >= 6) return { label: "Good", color: "#ffff00", message: "Slight haze possible." };
        if (km >= 3) return { label: "Moderate", color: "#ff7e00", message: "Some fog or pollution present." };
        if (km >= 1) return { label: "Poor", color: "#ff0000", message: "Visibility limited. Drive carefully." };
        return { label: "Very Poor", color: "#99004c", message: "Heavy fog/smog. Avoid travel if possible." };
    }

    getWorstPollutant(comp) {
        const list = [
            { label: "PM2.5", value: comp.pm2_5, color: this.getColor(comp.pm2_5, "pm2_5") },
            { label: "PM10", value: comp.pm10, color: this.getColor(comp.pm10, "pm10") },
            { label: "NO₂", value: comp.no2, color: this.getColor(comp.no2, "no2") },
            { label: "O₃", value: comp.o3, color: this.getColor(comp.o3, "o3") },
            { label: "CO", value: comp.co, color: this.getColor(comp.co, "co") },
            { label: "SO₂", value: comp.so2, color: this.getColor(comp.so2, "so2") }
        ];
        return list.sort((a, b) => b.value - a.value)[0];
    }

    getColor(val, type) {
        const thresholds = {
            pm2_5: [12, 35, 55, 150],
            pm10:  [54, 154, 254, 354],
            no2:   [53, 100, 360, 649],
            o3:    [70, 120, 180, 240],
            co:    [4.4, 9.4, 12.4, 15.4],
            so2:   [35, 75, 185, 304]
        };
        const colors = ['#00e400', '#ffff00', '#ff7e00', '#ff0000', '#99004c'];
        const t = thresholds[type];
        if (val <= t[0]) return colors[0];
        if (val <= t[1]) return colors[1];
        if (val <= t[2]) return colors[2];
        if (val <= t[3]) return colors[3];
        return colors[4];
    }

    getPollutionHealthSummary(aqi) {
        return [
            "Local air quality is: Excellent. Breathe deep!",
            "Local air quality is: Good. Enjoy the outdoors!",
            "Local air quality is: Moderate. Sensitive groups take caution.",
            "Local air quality is: Poor. Limit outdoor activity.",
            "Local air quality is: Unhealthy. Stay indoors if possible."
        ][aqi - 1] || "Air quality info unavailable.";
    }
    
    // UTILITY FUNCTIONS
    // =============================================================================
    
    formatTime(timestamp) {
        return new Date(timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    formatDuration(milliseconds) {
        const hours = Math.floor(milliseconds / (1000 * 60 * 60));
        const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
        return `${hours}h ${minutes}m`;
    }

    getWeatherIconClass(icon) {
        if (!icon) return 'wi wi-na';
        return `wi wi-owm-${icon}`;
    }

    getCompassDirection(degrees) {
        const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
        return directions[Math.round(degrees / 22.5) % 16];
    }

    getMoonPhaseName(phase) {
        if (phase === 0 || phase === 1) return 'New Moon';
        if (phase < 0.25) return 'Waxing Crescent';
        if (phase === 0.25) return 'First Quarter';
        if (phase < 0.5) return 'Waxing Gibbous';
        if (phase === 0.5) return 'Full Moon';
        if (phase < 0.75) return 'Waning Gibbous';
        if (phase === 0.75) return 'Last Quarter';
        return 'Waning Crescent';
    }

    setText(id, text) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = text;
        }
    }

    debounce(func, delay) {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }

    preloadAssets() {
        const assets = [
            "/storage/emulated/0/AutoTools/Gpicon/snowflake.png",
            "/storage/emulated/0/AutoTools/Gpicon/leaf.png"
        ];

        assets.forEach(src => {
            const img = new Image();
            img.src = src;
        });
    }
    
    // CSS INJECTION
    // =============================================================================
    
    injectAnimationCSS() {
        if (document.querySelector('#weather-animations-css')) return;

        const cssAnimations = `
        @keyframes fall-flake {
            to {
                transform: translateY(100vh) translateX(50px) rotate(360deg);
                opacity: 0;
            }
        }

        @keyframes fall-leaf {
            to {
                transform: translateY(100vh) translateX(200px) rotate(720deg);
                opacity: 0;
            }
        }

        @keyframes fall-raindrop {
            to {
                transform: translateY(100vh) translateX(10px);
                opacity: 0;
            }
        }

        @keyframes float-cloud {
            0%, 100% {
                transform: translateX(0px) translateY(0px);
            }
            25% {
                transform: translateX(20px) translateY(-10px);
            }
            50% {
                transform: translateX(-15px) translateY(5px);
            }
            75% {
                transform: translateX(10px) translateY(-5px);
            }
        }

        .cloud {
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1));
        }

        @media (max-width: 768px) {
            .cloud {
                transform: scale(0.8);
            }
        }

        @media (max-width: 480px) {
            .cloud {
                transform: scale(0.6);
            }
        }

        .flake, .leaf, .raindrop {
            filter: drop-shadow(0 1px 2px rgba(0,0,0,0.2));
        }

        #sky {
            transition: background 2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        #sun, #moon {
            transition: opacity 1.5s ease, filter 1.5s ease;
        }

        #clouds {
            transition: opacity 2s ease, filter 2s ease;
        }

        #fog {
            transition: opacity 3s ease;
        }

        #thunder {
            transition: opacity 0.1s ease;
        }
        `;

        const style = document.createElement('style');
        style.id = 'weather-animations-css';
        style.textContent = cssAnimations;
        document.head.appendChild(style);
    }
}

// =============================================================================
// INITIALIZATION
// =============================================================================

// Initialize the unified weather app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.unifiedWeatherApp = new UnifiedWeatherApp({
        apiKey: "3c511677984d2f330e332b9553c15ae7",
        lat: "47.1830439",
        lon: "-122.4716864",
        updateInterval: 300000 // 5 minutes
    });
});

// Export for potential module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UnifiedWeatherApp;
}
