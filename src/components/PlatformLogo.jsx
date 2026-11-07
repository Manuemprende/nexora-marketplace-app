import React from 'react';

const files = {
  Dropi: 'dropi.png',
  Dropea: 'dropea.png',
  Evolut: 'evolut.png',
  Jumpseller: 'jumpseller.png',
  Walmart: 'walmart.png',
  Facto: 'facto.png',
  'Mercado Libre': 'mercadolibre.svg',
};

export default function PlatformLogo({ name }) {
  return (
    <div className={'integrationPlatformLogo' + (name === 'Facto' ? ' wide' : '')}>
      <img
        src={'/platform-logos/' + files[name]}
        alt={name}
        width={name === 'Facto' ? 106 : 36}
        height="36"
      />
    </div>
  );
}
