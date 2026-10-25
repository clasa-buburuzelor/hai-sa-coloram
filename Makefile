
.PHONY: run-server dependencies convert

run-server:
	python3 -m http.server 8000

dependencies:
	sudo apt update
	sudo apt install -y imagemagick potrace

BASENAME = $(basename $(IMAGE))
PPM_FILE = $(BASENAME).pbm
SVG_FILE = $(BASENAME).svg

convert:
ifeq ($(strip $(IMAGE)),)
	$(error Variabila IMAGE nu este setată! Folosiți: make convert IMAGE=cale/catre/imagine.jpg)
endif
	@convert "$(IMAGE)" -threshold 50% "$(PPM_FILE)"
	@potrace "$(PPM_FILE)" -s -o "$(SVG_FILE)"
	@rm -f "$(PPM_FILE)"
	@echo "Succes! Fișierul SVG a fost generat: $(SVG_FILE)"
