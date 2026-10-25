type LogoVariant = 'grey' | 'white' | 'black' | 'extended-grey' | 'extended-white'

const assets: Record<LogoVariant, string> = {
  grey: '/brand/nazarene-logo-grey.png',
  white: '/brand/nazarene-logo-white.png',
  black: '/brand/nazarene-logo-black.png',
  'extended-grey': '/brand/nazarene-logo-extended-grey.png',
  'extended-white': '/brand/nazarene-logo-extended-white.png',
}

type LogoProps = { variant?: LogoVariant; className?: string }

export function Logo({ variant = 'extended-grey', className = '' }: LogoProps) {
  return <img className={`brand-logo ${className}`.trim()} src={assets[variant]} alt="Church of the Nazarene" />
}
