import { Stagger, StaggerItem } from "@/components/motion/Reveal";
import { IMG, Photo, SectionHeader } from "./shared";

const GALLERY = [
  { img: IMG.gallery[0], alt: "A table laid with a variety of catered dishes", gradient: "from-rose-200 to-amber-200", span: "md:col-span-2 md:row-span-2" },
  { img: IMG.gallery[1], alt: "Chef finishing a plated main course with sauce", gradient: "from-amber-200 to-orange-300", span: "" },
  { img: IMG.gallery[2], alt: "Gourmet canapés arranged on a serving tray", gradient: "from-stone-300 to-amber-200", span: "" },
  { img: IMG.gallery[3], alt: "Grazing board with cheeses, fruit and bread", gradient: "from-orange-200 to-rose-200", span: "" },
  { img: IMG.gallery[4], alt: "Elegant fine-dining plated dish", gradient: "from-amber-300 to-yellow-200", span: "" },
];

export function GallerySection() {
  return (
    <section id="gallery" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-20 md:py-28">
      <SectionHeader
        title="Beautiful events, flawlessly run"
        copy="The setups, the plating, the moments - powered behind the scenes by CateringMS."
      />

      <Stagger className="grid auto-rows-[200px] grid-cols-2 gap-4 md:grid-cols-4">
        {GALLERY.map((g, index) => (
          <StaggerItem key={index} className={g.span}>
            <div className="group relative h-full w-full overflow-hidden rounded-2xl shadow-sm">
              <Photo src={g.img} alt={g.alt} gradient={g.gradient} className="h-full w-full" zoom>
                <div className="absolute inset-0 bg-gradient-to-t from-stone-900/60 via-stone-900/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <p className="absolute bottom-4 left-4 right-4 translate-y-2 text-sm font-medium text-white opacity-0 transition-[opacity,transform] duration-300 ease-standard group-hover:translate-y-0 group-hover:opacity-100">
                  {g.alt}
                </p>
              </Photo>
            </div>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}
