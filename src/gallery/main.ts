import { mount } from 'svelte';
import App from './App.svelte';
import type { GalleryVariant } from '../lib/gallery/types';

const target = document.getElementById('app')!;
const variant = (target.dataset.variant ?? 'cinema') as GalleryVariant;
mount(App, { target, props: { variant } });
