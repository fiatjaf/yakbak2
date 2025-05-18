export PATH := "./node_modules/.bin:" + env_var('PATH')

dev:
  vite

build:
  vite build
