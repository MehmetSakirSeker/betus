document.addEventListener('DOMContentLoaded', () => {
    // === STATE ===
    const state = {
        slides: [],
        currentSlideIndex: 0,
        data: {
            totalMessages: 0,
            startDate: null,
            daysTogether: 0,
            mostActiveDay: { date: '', count: 0 },
            mostUsedWord: '',
            mostUsedEmoji: '',
            loveWords: {}, // Stores counts for specific romantic words
            timeOfDay: { morning: 0, afternoon: 0, evening: 0, night: 0 },
            'callHours': window.LOVE_CONFIG ? window.LOVE_CONFIG.callHours : 0
        },
        audio: null,
        // Romantic words list to track specifically
        targetLoveWords: [
            'aşk', 'aşkım', 'bitanem', 'balım', 'sevgilim', 'canım', 'hayatım', 
            'velinimetim', 'beyim', 'güzelim', 'prensesim', 'evimin direği', 
            'elianın babası', 'tatlım', 'bebeğim', 'her şeyim', 'ömrüm', 
        ],
        stopwords: new Set([
            'the', 'and', 'to', 'of', 'a', 'in', 'is', 'that', 'for', 'it', 'you', 'i', 'me', 'my', 'we', 'our',
            'this', 'on', 'with', 'be', 'are', 'your', 'at', 'so', 'if', 'or', 'but', 'what', 'love', 
            'chat', 'media', 'omitted', 'image', 'video', 'sticker', 'gif', 'missed', 'call', 'audio',
            // Turkish common stopwords (Expanded)
            've', 'bir', 'bu', 'da', 'de', 'için', 'ben', 'sen', 'o', 'biz', 'siz', 'onlar', 'ne', 'gibi',
            'ama', 'çok', 'var', 'yok', 'mi', 'mı', 'mu', 'mü', 'ile', 'şu', 'her', 'şey', 'ki', 'bana', 'sana',
            'tamam', 'peki', 'evet', 'hayır', 'ya', 'bi', 'kadar', 'zaten', 'yani', 'bence', 'böyle', 'öyle',
            'daha', 'en', 'ise', 'bari', 'hiç', 'diye', 'zaman', 'sonra', 'önce', 'şimdi', 'nasıl', 'neden', 'niye',
            'bunu', 'şunu', 'buna', 'şuna', 'ondan', 'bundan', 'beni', 'seni', 'ona', 'bize', 'size',
            'olsun', 'oldu', 'olan', 'olarak', 'sadece', 'bile', 'kendi', 'kendine', 'aynen', 'tabii', 'tabi'
        ])
    };

    // === DOM ELEMENTS ===
    const app = document.getElementById('app');
    const uploadSection = document.getElementById('upload-section');
    const slidesContainer = document.getElementById('slides-container');
    const fileInput = document.getElementById('chat-file');
    const loadingIndicator = document.getElementById('loading');
    const controls = document.getElementById('controls');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const progressBar = document.getElementById('progress-bar');
    const initialLoading = document.getElementById('initial-loading');
    // Manual upload removed
    // const manualUpload = document.getElementById('manual-upload');
    const errorMessage = document.getElementById('error-message');

    // === AUTO LOAD CHECK ===
    // Attempt to fetch '_chat.txt' automatically
    fetch('_chat.txt')
        .then(response => {
            if (!response.ok) throw new Error("File not found");
            return response.text();
        })
        .then(text => {
            // Success - Process immediately
            initialLoading.querySelector('p').textContent = "Found our story! Analyzing...";
            setTimeout(() => {
                processChatData(text);
                initializeSlides();
            }, 500); // Small delay for visual flow
        })
        .catch(err => {
            // Fail - Show error
            console.log("Auto-load failed.", err);
            initialLoading.classList.add('hidden');
            if(errorMessage) errorMessage.classList.remove('hidden');
            // manualUpload.classList.remove('hidden');
        });


    // === EVENT LISTENERS ===
    if(fileInput) fileInput.addEventListener('change', handleFileUpload);
    prevBtn.addEventListener('click', () => navigateSlide(-1));
    nextBtn.addEventListener('click', () => navigateSlide(1));

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (state.slides.length === 0) return;
        if (e.key === 'ArrowRight' || e.key === ' ') navigateSlide(1);
        if (e.key === 'ArrowLeft') navigateSlide(-1);
    });

    // === MAIN FUNCTIONS ===

    function handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        // UI Update
        document.querySelector('.upload-box').classList.add('hidden');
        loadingIndicator.classList.remove('hidden');

        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            // Small timeout to allow UI to render 'loading' before heavy processing
            setTimeout(() => {
                processChatData(text);
                initializeSlides();
            }, 100);
        };
        reader.readAsText(file);
    }

    function processChatData(text) {
        // Normalize newlines to handle Windows/Unix differences explicitly
        const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
        
        // Improved Regex - Extremely Robust
        // Strips all invisible chars from the start before matching in the loop.
        // Matches "DD.MM.YYYY" or "DD/MM/YYYY" or "DD-MM-YYYY"
        // Matches ", " or " " separator
        // Matches "HH:MM" or "HH:MM:SS"
        const dateRegex = /^\[?(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})[,\s-]{1,5}(\d{1,2}:\d{2})/;
        
        // Counters
        let messageCount = 0;
        let firstDate = null;
        const dateMap = {}; 
        const wordMap = {};
        const loveWordMap = {};
        const emojiMap = {};
        const timeMap = { morning: 0, afternoon: 0, evening: 0, night: 0 };
        
        lines.forEach(line => {
            if (!line) return;

            // CRITICAL FIX: Clean invisible characters (LTR marks, BOM, etc) from start of line
            // This ensures logic works even if file is "dirty" with unicode markers
             let cleanLine = line.replace(/^[\u2000-\u206F\u0000-\u001F\s]+/, ''); // Strip control/space chars
             cleanLine = cleanLine.replace(/^[^0-9\[]+/, ''); // Heuristic: Strip anything until first digit or '['

             // Backup: if the line was " [Date...", cleanLine matches better now.
             
            const dateMatch = cleanLine.match(dateRegex);
            
            if (dateMatch) {
                messageCount++;
                const dateStr = dateMatch[1]; 
                const timeStr = dateMatch[2];

                // Track First Date
                if (!firstDate) {
                    firstDate = parseDate(dateStr);
                }

                // Track Active Day
                dateMap[dateStr] = (dateMap[dateStr] || 0) + 1;

                // Track Time of Day
                if (timeStr) {
                    const hour = parseInt(timeStr.split(':')[0]);
                    if (hour >= 5 && hour < 12) timeMap.morning++;
                    else if (hour >= 12 && hour < 17) timeMap.afternoon++;
                    else if (hour >= 17 && hour < 22) timeMap.evening++;
                    else timeMap.night++;
                }

                // Track Words & Emojis
                let contentPart = '';
                
                // Extract content based on separator pattern
                // Use `line` (original) or `cleanLine`? `cleanLine` is safer for structure.
                
                // 1. Try iOS style "] Name: Message"
                // Finds first "]" that is followed by space
                const rightBracketIdx = cleanLine.indexOf('] ');
                if (rightBracketIdx > -1) {
                    const afterBracket = cleanLine.substring(rightBracketIdx + 2);
                    // Find first ": " to split Name and Message
                    const colonIdx = afterBracket.indexOf(': ');
                    if (colonIdx > -1) {
                        contentPart = afterBracket.substring(colonIdx + 2);
                    } else {
                        // Sometimes system msg like "name added xx" has no colon, ignore or handle?
                        // usually we only care about messages with content
                    }
                } 
                
                // 2. Try Android style " - Name: Message"
                if (!contentPart) {
                    const dashIdx = cleanLine.indexOf(' - ');
                    if (dashIdx > -1) {
                         const afterDash = cleanLine.substring(dashIdx + 3);
                         const colonIdx = afterDash.indexOf(': ');
                         if (colonIdx > -1) {
                             contentPart = afterDash.substring(colonIdx + 2);
                         }
                    }
                }

                // 3. Fallback: Just look for first ": " after the timestamp area
                if (!contentPart) {
                     // dateMatch[0] is "[12.01.2026, 22:55"
                     const len = dateMatch[0].length;
                     const afterTimestamp = cleanLine.substring(len);
                     const colonIdx = afterTimestamp.indexOf(': ');
                     if (colonIdx > -1) {
                         contentPart = afterTimestamp.substring(colonIdx + 2);
                     }
                }

                if (contentPart) {
                    // Filter system messages
                    if (contentPart.includes('Media omitted') || 
                        contentPart.includes('image omitted') || 
                        contentPart.includes('sticker omitted') ||
                        contentPart.includes('audio omitted') ||
                        contentPart.includes('Messages and calls are end-to-end encrypted')) return;

                    // Extract Emojis
                    const emojis = contentPart.match(/\p{Emoji_Presentation}/gu);
                    if (emojis) {
                        emojis.forEach(e => {
                            emojiMap[e] = (emojiMap[e] || 0) + 1;
                        });
                    }

                    // Extract Words
                    // Fix: Removed \b boundaries because JS \b treats Turkish chars as non-word chars, incorrectly splitting words like "böyle" -> "yle".
                    // \p{L}+ correctly grabs full unicode words including Turkish chars.
                    const lowerContent = contentPart.toLowerCase();
                    const words = lowerContent.match(/\p{L}+/gu); 
                    if (words) {
                        words.forEach(w => {
                            // General Word Stats
                            if (w.length > 2 && !state.stopwords.has(w) && !isGibberish(w)) {
                                wordMap[w] = (wordMap[w] || 0) + 1;
                            }
                        });
                    }

                    // Scan for Multi-word Love Phrases (e.g. "evimin direği")
                    state.targetLoveWords.forEach(loveWord => {
                        // Check if the phrase exists in the lowercased message
                        // Use regex to ensure we don't match "başkan" for "aşk" if wanted, 
                        // though for simple matching `includes` is often enough for phrases.
                        // Let's use simple includes for multi-word, and exact match for single word
                        if (loveWord.includes(' ')) {
                             if (lowerContent.includes(loveWord)) {
                                 loveWordMap[loveWord] = (loveWordMap[loveWord] || 0) + 1;
                             }
                        } else {
                            // Single word, use regex boundary check manually or reuse word list logic
                             if (words && words.includes(loveWord)) {
                                 // Count occurrences
                                 const count = words.filter(w => w === loveWord).length;
                                 loveWordMap[loveWord] = (loveWordMap[loveWord] || 0) + count;
                             }
                        }
                    });
                }
            }
        });

        // 1. Stats Calculation
        state.data.totalMessages = messageCount;

        // 2. Days Together
        if (firstDate) {
            state.data.startDate = firstDate;
            const now = new Date();
            const diffTime = Math.abs(now - firstDate);
            state.data.daysTogether = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        }

        // 3. Most Active Day
        const bestDay = Object.keys(dateMap).reduce((a, b) => dateMap[a] > dateMap[b] ? a : b, '');
        state.data.mostActiveDay = { date: bestDay, count: dateMap[bestDay] || 0 };

        // 4. Most Used Word
        let sortedWords = Object.entries(wordMap).sort((a,b) => b[1] - a[1]);
        if (sortedWords.length > 0) {
             state.data.mostUsedWord = sortedWords[0][0];
        }

        // 5. Most Used Emoji
        let sortedEmojis = Object.entries(emojiMap).sort((a,b) => b[1] - a[1]);
        if (sortedEmojis.length > 0) {
            state.data.mostUsedEmoji = sortedEmojis[0][0];
        } else {
            state.data.mostUsedEmoji = '❤️'; // Default
        }

        // 5.5 Love Words
        state.data.loveWords = loveWordMap;

        // 6. Time of Day
        state.data.timeOfDay = timeMap;

        console.log("Analysis Complete:", state.data);
    }
    
    function isGibberish(word) {
        // User specific rule: If word contains 'j', exclude it completely.
        // This is efficient for filtering out most Turkish laugh variations (sjsj, jajaj, asdasj).
        if (word.includes('j')) return true;

        // Filter out strict repeats like "aaaaa" or "hahaha" patterns
        if (word.length > 15) return true; // Too long usually keysmash
        if (/^(.)\1+$/.test(word)) return true; // "oooooo"
        
        // Common Turkish laugh/slang patterns
        const laughPatterns = [
            'haha', 'hehe', 'hihi', 'jsjs', 'asds', 'sjsj', 'kszm', 'random', 'omitted', 'null',
            // 'j' removal handles many, but keep others
            'asdf', 'qwe', 'ksks', 'sksk', 'gsh', 'gsg', 'asdd', 'kdkd'
        ];
        for (let p of laughPatterns) {
            if (word.includes(p)) return true;
        }

        // Sequence of 4+ consonants is suspicious for many languages (unless specific ones)
        // Adjust for Turkish: Turkish words rarely have extensive consonant clusters
        
        return false;
    }


    function initializeSlides() {
        // Start Music
        const audio = document.getElementById('bg-music');
        if (audio) {
            state.audio = audio;
            audio.volume = 0.1;
            audio.play().catch(e => console.log("Audio play blocked until interaction", e));
            
            // Setup controls
            const toggleBtn = document.getElementById('music-toggle');
            const volumeSlider = document.getElementById('volume-slider');
            
            if (toggleBtn) {
                toggleBtn.addEventListener('click', () => {
                    if (audio.paused) {
                        audio.play();
                        toggleBtn.textContent = '🎵';
                    } else {
                        audio.pause();
                        toggleBtn.textContent = '🔇';
                    }
                });
            }
            
            if (volumeSlider) {
                volumeSlider.addEventListener('input', (e) => {
                    audio.volume = e.target.value;
                });
            }
        }

        // Hide upload, show slides
        uploadSection.classList.remove('active');
        uploadSection.classList.add('hidden');
        slidesContainer.classList.remove('hidden');
        controls.classList.remove('hidden');

        // Populate Data into DOM
        const msgEl = document.getElementById('total-messages-count');
        msgEl.textContent = state.data.totalMessages.toLocaleString();
        msgEl.dataset.target = state.data.totalMessages;
        
        if (state.data.startDate) {
            const options = { year: 'numeric', month: 'long', day: 'numeric' };
            document.getElementById('start-date').textContent = state.data.startDate.toLocaleDateString(undefined, options);
            
            const daysEl = document.getElementById('days-count');
            daysEl.textContent = state.data.daysTogether.toLocaleString();
            daysEl.dataset.target = state.data.daysTogether;
        }

        document.getElementById('active-day-date').textContent = state.data.mostActiveDay.date;
        document.getElementById('active-day-count').textContent = `${state.data.mostActiveDay.count.toLocaleString()} mesaj`;

        document.getElementById('fav-word').textContent = state.data.mostUsedWord ? `"${state.data.mostUsedWord}"` : '"..."';

        // Most Used Emoji
        document.getElementById('fav-emoji').textContent = state.data.mostUsedEmoji || '❤️';
        
        // Time of Day Logic
        const times = state.data.timeOfDay;
        if (times) {
            const maxTime = Object.keys(times).reduce((a, b) => times[a] > times[b] ? a : b);
            let vibeTitle = "Gece Kuşları 🌙";
            let vibeDesc = "Birbirimiz için geç saatlere kadar uyanığız";
            
            if (maxTime === 'morning') {
                vibeTitle = "Erken Kuşlar 🌅";
                vibeDesc = "Güne birlikte başlıyoruz";
            } else if (maxTime === 'afternoon') {
                vibeTitle = "Gündüz Hayalperestleri ☀️";
                vibeDesc = "Tüm gün birbirimizin yanında oluyoruz";
            } else if (maxTime === 'evening') {
                vibeTitle = "Gün Batımı Aşıkları 🌇";
                vibeDesc = "Uzun bir günün ardından birlikte rahatlıyoruz";
            }
            
            const vibeElement = document.getElementById('time-vibe');
            if (vibeElement) vibeElement.textContent = vibeTitle;
            
            const statElement = document.getElementById('time-stat');
            if (statElement) statElement.textContent = vibeDesc;
        }
        
        // Use data-target for stable animation parsing
        const callEl = document.getElementById('call-hours')
        callEl.textContent = state.data.callHours;
        callEl.dataset.target = state.data.callHours;

        // Render Love Cloud
        renderLoveCloud();

        // Collect all slides
        state.slides = Array.from(document.querySelectorAll('.slide')).filter(s => s.id !== 'upload-section');
        state.currentSlideIndex = 0;
        
        updateSlideDisplay();
    }

    function renderLoveCloud() {
        const container = document.getElementById('love-word-cloud');
        if (!container) return;
        
        container.innerHTML = '';
        const loveWords = state.data.loveWords || {};
        
        // Convert to array and sort
        let sorted = Object.entries(loveWords).sort((a, b) => b[1] - a[1]);
        
        // Take top 30
        sorted = sorted.slice(0, 30);
        
        if (sorted.length === 0) {
            container.innerHTML = '<span class="cloud-word word-rank-2" style="position:relative; top:auto; left:auto;">Henüz yeterli veri yok ❤️</span>';
            return;
        }

        const topWord = sorted[0];
        const others = sorted.slice(1);
        
        // Render Top Word (CSS handles centering via .word-rank-1)
        const topEl = document.createElement('span');
        topEl.textContent = topWord[0];
        topEl.className = 'cloud-word word-rank-1';
        topEl.title = `${topWord[1]} kez`;
        container.appendChild(topEl);

        // GRID SYSTEM FOR SCATTERING
        // Define a 6x6 grid (36 slots)
        // Rows: 0-5, Cols: 0-5
        let availableSlots = [];
        for (let r = 0; r < 6; r++) {
            for (let c = 0; c < 6; c++) {
                // EXCLUSIONS:
                
                // 1. Center Box (Rank 1 word): Rows 2,3 AND Cols 2,3
                // This covers the middle 33% area
                if ((r === 2 || r === 3) && (c === 2 || c === 3)) continue;

                // 2. Title Area (Top Center): Row 0 AND Cols 1,2,3,4 to be safe
                // The title is quite wide generally
                if (r === 0 && (c >= 1 && c <= 4)) continue;

                availableSlots.push({ r, c });
            }
        }

        // Shuffle slots
        for (let i = availableSlots.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [availableSlots[i], availableSlots[j]] = [availableSlots[j], availableSlots[i]];
        }

        // Render Others with Grid Positions
        others.forEach((item, index) => {
            if (availableSlots.length === 0) return; // Should not happen with limit 30

            const word = item[0];
            const count = item[1];
            const originalRank = sorted.findIndex(x => x[0] === word);
            
            const el = document.createElement('span');
            el.textContent = word;
            el.className = 'cloud-word';
            el.title = `${count} kez`;
            
            // Assign size classes
            if (originalRank === 1) el.classList.add('word-rank-2');
            else if (originalRank === 2) el.classList.add('word-rank-3');
            else if (originalRank < 5) el.classList.add('word-rank-4');
            else if (originalRank < 10) el.classList.add('word-rank-5');
            else el.classList.add('word-rank-small');
            
            // Get slot
            const slot = availableSlots.pop();
            
            // Grid calculations
            // Cell size is approx 100/6 = 16.66%
            const cellW = 100 / 6;
            const cellH = 100 / 6;
            
            // Center of cell
            const centerX = (slot.c * cellW) + (cellW / 2);
            const centerY = (slot.r * cellH) + (cellH / 2);
            
            // Add randomness (Jitter) within the cell
            // Jitter range: +/- 25% of cell size
            const jitterX = (Math.random() - 0.5) * (cellW * 0.5);
            const jitterY = (Math.random() - 0.5) * (cellH * 0.5);
            
            const finalX = centerX + jitterX;
            const finalY = centerY + jitterY;

            el.style.left = `${finalX}%`;
            el.style.top = `${finalY}%`;
            
            // Transform origin is center, so just setting left/top as center point?
            // CSS position usually sets top-left corner.
            // To center it on the point, we should use transform: translate(-50%, -50%)
            // BUT we also want rotation.
            // So logic: left/top sets anchor, transform handles centering + rotation.
            
            // Random rotation
            const rot = Math.floor(Math.random() * 40) - 20; // -20 to +20 deg
            
            // IMPORTANT: Combine translate(-50%, -50%) for centering point with rotation
            el.style.transform = `translate(-50%, -50%) rotate(${rot}deg)`;
            
            el.onmouseenter = () => {
                el.style.zIndex = '100'; 
                el.style.transform = `translate(-50%, -50%) scale(1.2) rotate(0deg)`;
            };
            el.onmouseleave = () => {
                el.style.zIndex = '';
                el.style.transform = `translate(-50%, -50%) rotate(${rot}deg)`;
            };

            container.appendChild(el);
        });
    }

    function navigateSlide(direction) {
        const newIndex = state.currentSlideIndex + direction;
        if (newIndex >= 0 && newIndex < state.slides.length) {
            state.currentSlideIndex = newIndex;
            updateSlideDisplay();
        }
    }

    function updateSlideDisplay() {
        // Toggle active class
        state.slides.forEach((slide, index) => {
            if (index === state.currentSlideIndex) {
                slide.classList.add('active');
                triggerSlideAnimations(slide);
            } else {
                slide.classList.remove('active');
            }
        });

        // Update Nav visibility
        prevBtn.style.opacity = state.currentSlideIndex === 0 ? '0.3' : '1';
        prevBtn.disabled = state.currentSlideIndex === 0;
        
        nextBtn.style.opacity = state.currentSlideIndex === state.slides.length - 1 ? '0.3' : '1';
        nextBtn.disabled = state.currentSlideIndex === state.slides.length - 1;

        // Update Progress Bar
        const progress = ((state.currentSlideIndex + 1) / state.slides.length) * 100;
        progressBar.style.width = `${progress}%`;
    }

    function triggerSlideAnimations(slide) {
        // Specifically look for counters to animate
        const counters = slide.querySelectorAll('.big-number');
        counters.forEach(counter => {
            // Safer parsing: Use data-target if available, else parse text (removing dots/commas)
            let target = 0;
            if (counter.dataset.target) {
                target = parseInt(counter.dataset.target, 10);
            } else {
                // Fallback: Remove commas AND dots to be safe against all locales
                target = parseInt(counter.textContent.replace(/[.,]/g, ''), 10);
            }
            
            if (!isNaN(target) && target > 0) {
                animateValue(counter, 0, target, 1500);
            }
        });
    }

    function animateValue(obj, start, end, duration) {
        // Check if already animating to avoid reset glitch
        if (obj.dataset.animating === "true") return;
        obj.dataset.animating = "true";

        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            
            // Ease out quart
            const easeProgress = 1 - Math.pow(1 - progress, 4);
            
            const currentVal = Math.floor(easeProgress * (end - start) + start);
            obj.innerHTML = currentVal.toLocaleString();
            
            if (progress < 1) {
                window.requestAnimationFrame(step);
            } else {
                obj.dataset.animating = "false";
            }
        };
        window.requestAnimationFrame(step);
    }

    // Helper: Parse Date strictly from DD/MM/YYYY or similar
    function parseDate(dateStr) {
        // Try to handle dd/mm/yyyy
        const parts = dateStr.split(/[\/.-]/);
        if (parts.length === 3) {
            let d = parseInt(parts[0]);
            let m = parseInt(parts[1]) - 1; // months are 0-based
            let y = parseInt(parts[2]);
            // Handle 2 digit year
            if (y < 100) y += 2000;
            return new Date(y, m, d);
        }
        return new Date(); // fallback
    }

});
