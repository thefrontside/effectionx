import '@shoelace-style/shoelace/dist/themes/light.css';
import { setBasePath } from '@shoelace-style/shoelace';
import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';

// Tell Shoelace where to find its assets
setBasePath( import.meta.env.BASE_URL + "shoelace/" );
