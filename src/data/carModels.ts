// Real 3D models shown when a car is finished (public/models/). All are CC BY 4.0 from Sketchfab, shrunk for phones
// (smaller textures, mesh compression, fewer triangles). Each is credited in the app under Garage -> Photo credits.
export interface CarModelInfo {
  /** Turn the model half a circle so its nose points the same way as the built car's. */
  flip?: boolean;
  title: string;
  author: string;
  license: string;
  licenseUrl: string;
  /** The model's page on Sketchfab. */
  page: string;
}

const BY = 'https://creativecommons.org/licenses/by/4.0/';
const model = (title: string, author: string, uid: string, flip = false): CarModelInfo => ({ title, author, license: 'CC BY 4.0', licenseUrl: BY, page: `https://sketchfab.com/3d-models/${uid}`, flip });

export const CAR_MODELS: Record<string, CarModelInfo> = {
  'bmw-x1': model('BMW X1 2013', 'Merc_TV', '302b32456b054dbdb5b72a08aca2bb80'),
  'maruti-swift': model('Suzuki Swift', 'r34maxpro', '0c95b53e58f348b4b6f13735707c611e', true),
  'tata-nano': model('Tata Nano', 'BumpkinCZ', 'b40695a12723449dbdc5976700c8f1b6', true),
  'mahindra-thar': model('THAR 4X4', 'MB_Mahesh', '66ee970b18014c98a1750064b65657b0'),
  'toyota-fortuner': model('2020 Toyota Fortuner Legender', 'David_Holiday', '3d9701bc2610466198f2cea996bd0fdc'),
  'bmw-3-series': model('Low Poly Car - BMW E30 1985 White', 'ROH3D', '9dea494b447e442fafbddfc7eccbf158', true),
  'porsche-911': model('FREE 1975 Porsche 911 (930) Turbo', 'Lionsharp Studios', '8568d9d14a994b9cae59499f0dbed21e'),
  'rolls-royce-ghost': model('Rolls-Royce Ghost', 'Black Snow', '4a590f4afa094fa8b407a14db77a63a8'),
  'tesla-model-3': model('Tesla Model 3', 'David_Holiday', '123c10f376ec4f18b93c73afc382808b'),
};
