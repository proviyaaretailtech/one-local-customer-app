import { catalog, inCity, resolveCity } from '../../server/catalog';
import { json, route } from '../../server/http';

export const GET = route(request => {
  const city = resolveCity(request);
  return json({
    city,
    brands: inCity(catalog.brands, city),
    products: inCity(catalog.products, city),
    categories: catalog.categories,
    events: inCity(catalog.events, city),
    themed_stores: inCity(catalog.themed_stores, city),
    sample: true,
  });
});
