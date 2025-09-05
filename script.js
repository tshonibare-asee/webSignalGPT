// Tab functionality for Web Signal GPT
document.addEventListener('DOMContentLoaded', function() {
    const tabs = document.querySelectorAll('.tab');
    const iframe = document.getElementById('content-frame');
    
    // Add click event listeners to tabs
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            // Remove active class from all tabs
            tabs.forEach(t => t.classList.remove('active'));
            
            // Add active class to clicked tab
            this.classList.add('active');
            
            // Get the tab name and update iframe src
            const tabName = this.getAttribute('data-tab');
            updateIframeContent(tabName);
        });
    });
    
    function updateIframeContent(tab) {
        switch (tab) {
            case 'chat':
                iframe.src = 'public/chat.html';
                break;
            case 'processing-diagram':
                iframe.src = 'public/processing-diagram.html';
                break;
            case 'signal-probe':
                iframe.src = 'public/signal-probe.html';
                break;
            case 'available-blocks':
                iframe.src = 'public/available-blocks.html';
                break;
            default:
                iframe.src = 'public/default.html';
        }
    }
    
    // Initialize with default content
    updateIframeContent('chat');
});