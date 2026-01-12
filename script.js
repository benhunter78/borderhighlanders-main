// Check localStorage for vandalized state on page load
document.addEventListener('DOMContentLoaded', function() {
    const isVandalized = localStorage.getItem('vandalized') === 'true';
    const vandalizeLink = document.getElementById('vandalize-link');

    if (isVandalized) {
        document.body.classList.add('vandalized');
        vandalizeLink.textContent = "I'm going green!";
    }

    // Function to update the final image on the about page
    function updateFinalImage() {
        const finalImage = document.getElementById('final-image');
        if (finalImage) {
            const currentlyVandalized = document.body.classList.contains('vandalized');
            if (currentlyVandalized) {
                finalImage.src = 'images/homecoming.jpg';
                finalImage.alt = 'Band in Vandal tartan at homecoming';
            } else {
                finalImage.src = 'images/portrait.jpg';
                finalImage.alt = 'Band portrait';
            }
        }
    }

    // Update final image on page load
    updateFinalImage();

    // Function to toggle vandalized state
    function toggleVandalize() {
        const currentlyVandalized = document.body.classList.contains('vandalized');

        if (currentlyVandalized) {
            // Revert to normal
            document.body.classList.remove('vandalized');
            vandalizeLink.textContent = 'Vandalize this page!';
            localStorage.setItem('vandalized', 'false');
        } else {
            // Apply vandalized colors
            document.body.classList.add('vandalized');
            vandalizeLink.textContent = "I'm going green!";
            localStorage.setItem('vandalized', 'true');
        }

        // Update the final image after toggling
        updateFinalImage();
    }

    // Add click event listener to main vandalize link
    vandalizeLink.addEventListener('click', function(e) {
        e.preventDefault();
        toggleVandalize();
    });

    // Add click event listener to vandal tartan link (About page)
    const vandalTartanLink = document.getElementById('vandal-tartan-link');
    if (vandalTartanLink) {
        vandalTartanLink.addEventListener('click', function(e) {
            e.preventDefault();
            toggleVandalize();
        });
    }

    // Skeleton bagpipe animation on logo click
    const heroLogo = document.querySelector('.hero-logo');
    if (heroLogo) {
        heroLogo.addEventListener('click', function() {
            // Create the animated skeleton
            const skeleton = document.createElement('img');
            skeleton.src = 'images/skeletonBagpipe.png';
            skeleton.style.position = 'fixed';
            skeleton.style.top = '20px';
            skeleton.style.left = '-300px';
            skeleton.style.height = '240px';
            skeleton.style.width = 'auto';
            skeleton.style.zIndex = '1000';
            skeleton.style.transition = 'left 3s linear';
            skeleton.style.pointerEvents = 'none';

            document.body.appendChild(skeleton);

            // Trigger animation after a brief delay
            setTimeout(() => {
                skeleton.style.left = '100vw';
            }, 10);

            // Remove the skeleton after animation completes
            setTimeout(() => {
                skeleton.remove();
            }, 3100);
        });
    }

    // Scroll animation for about page images
    const observerOptions = {
        threshold: 0.2,
        rootMargin: '0px 0px -100px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Observe all slide-in images
    document.querySelectorAll('.slide-in-left, .slide-in-right').forEach(img => {
        observer.observe(img);
    });
});
