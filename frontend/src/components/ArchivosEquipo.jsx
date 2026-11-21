import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  ACCEPT_ARCHIVOS,
  crearObjectUrl,
  descargarArchivo,
  eliminarArchivo,
  esImagen,
  formatearTamano,
  listarArchivos,
  subirArchivo,
  validarArchivoLocal,
} from "../services/archivos.js";
import "./ArchivosEquipo.css";

const formatoFecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" });
const fecha = (texto) => {
  const valor = new Date(String(texto).replace(" ", "T"));
  return Number.isNaN(valor.getTime()) ? texto : formatoFecha.format(valor);
};

/**
 * Archivos (fotos PNG/JPEG y PDF) de un equipo.
 * - Todos los usuarios con sesión: listar, ver y descargar.
 * - isAdmin: además subir y eliminar (el servidor también lo exige).
 *
 *   <ArchivosEquipo idEquipo={equipo.id_equipo} isAdmin={isAdmin} />
 */
export function ArchivosEquipo({ idEquipo, isAdmin = false }) {
  const [archivos, setArchivos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [ocupado, setOcupado] = useState(null); // id del archivo con una acción en curso
  const [seleccion, setSeleccion] = useState(null);
  const [descripcion, setDescripcion] = useState("");
  const [principal, setPrincipal] = useState(false);
  const [inputKey, setInputKey] = useState(0);
  const [miniaturas, setMiniaturas] = useState({});
  const [visor, setVisor] = useState(null); // { archivo, url, error }

  const miniaturasRef = useRef(new Map());
  const visorUrlRef = useRef(null);
  const listaRef = useRef(null);
  const idCampo = useId();

  const cargar = useCallback(
    async (signal) => {
      if (!idEquipo) return;
      setError("");
      try {
        setArchivos((await listarArchivos(idEquipo, { signal })) ?? []);
      } catch (requestError) {
        if (requestError.name === "AbortError") return;
        setArchivos([]);
        setError(requestError.message || "No fue posible cargar los archivos.");
      } finally {
        if (!signal?.aborted) setCargando(false);
      }
    },
    [idEquipo],
  );

  // Si un binario responde 401, se vuelve a pedir la lista con api(): eso dispara el manejo
  // global de sesión vencida (AuthContext → /login con aviso).
  const manejarErrorBinario = useCallback(
    (requestError, textoPorDefecto) => {
      if (requestError.status === 401) cargar();
      setError(requestError.message || textoPorDefecto);
    },
    [cargar],
  );

  useEffect(() => {
    const controller = new AbortController();
    setCargando(true);
    setArchivos([]);
    setMensaje("");
    cargar(controller.signal);
    return () => controller.abort();
  }, [cargar]);

  // Miniaturas de imágenes: se piden con fetch autenticado y se liberan cuando dejan de usarse.
  useEffect(() => {
    const controller = new AbortController();
    const mapa = miniaturasRef.current;
    const vigentes = new Set(archivos.map((archivo) => archivo.id_archivo));
    for (const [id, url] of mapa) {
      if (!vigentes.has(id)) {
        URL.revokeObjectURL(url);
        mapa.delete(id);
      }
    }
    setMiniaturas(Object.fromEntries(mapa));

    archivos
      .filter((archivo) => esImagen(archivo) && !mapa.has(archivo.id_archivo))
      .forEach(async (archivo) => {
        try {
          const url = await crearObjectUrl(archivo.id_archivo, { signal: controller.signal });
          if (controller.signal.aborted) return URL.revokeObjectURL(url);
          mapa.set(archivo.id_archivo, url);
          setMiniaturas(Object.fromEntries(mapa));
        } catch (requestError) {
          if (requestError.name !== "AbortError" && requestError.status === 401) cargar();
        }
      });

    return () => controller.abort();
  }, [archivos, cargar]);

  // Al desmontar: revocar todos los object URLs.
  useEffect(() => {
    const mapa = miniaturasRef.current;
    return () => {
      for (const url of mapa.values()) URL.revokeObjectURL(url);
      mapa.clear();
      if (visorUrlRef.current) URL.revokeObjectURL(visorUrlRef.current);
      visorUrlRef.current = null;
    };
  }, []);

  const cerrarVisor = useCallback(() => {
    if (visorUrlRef.current) URL.revokeObjectURL(visorUrlRef.current);
    visorUrlRef.current = null;
    setVisor(null);
  }, []);

  useEffect(() => {
    if (!visor) return undefined;
    const alPresionar = (event) => event.key === "Escape" && cerrarVisor();
    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
  }, [visor, cerrarVisor]);

  async function abrirVisor(archivo) {
    cerrarVisor();
    setVisor({ archivo, url: null, error: "" });
    try {
      const url = await crearObjectUrl(archivo.id_archivo);
      visorUrlRef.current = url;
      setVisor({ archivo, url, error: "" });
    } catch (requestError) {
      if (requestError.status === 401) cargar();
      setVisor({ archivo, url: null, error: requestError.message || "No fue posible abrir el archivo." });
    }
  }

  async function descargar(archivo) {
    setOcupado(archivo.id_archivo);
    setError("");
    try {
      await descargarArchivo(archivo);
    } catch (requestError) {
      manejarErrorBinario(requestError, "No fue posible descargar el archivo.");
    } finally {
      setOcupado(null);
    }
  }

  async function subir(event) {
    event.preventDefault();
    setMensaje("");
    const problema = validarArchivoLocal(seleccion);
    if (problema) return setError(problema);
    setError("");
    setSubiendo(true);
    try {
      await subirArchivo({ idEquipo, archivo: seleccion, descripcion, principal });
      setSeleccion(null);
      setDescripcion("");
      setPrincipal(false);
      setInputKey((valor) => valor + 1);
      await cargar();
      setMensaje("Archivo cargado correctamente.");
      listaRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (requestError) {
      setError(requestError.message || "No fue posible cargar el archivo.");
    } finally {
      setSubiendo(false);
    }
  }

  async function eliminar(archivo) {
    if (!window.confirm(`¿Eliminar "${archivo.nombre_original}"? Esta acción no se puede deshacer.`)) return;
    setOcupado(archivo.id_archivo);
    setError("");
    setMensaje("");
    try {
      await eliminarArchivo(archivo.id_archivo);
      if (visor?.archivo.id_archivo === archivo.id_archivo) cerrarVisor();
      await cargar();
      setMensaje("Archivo eliminado.");
    } catch (requestError) {
      setError(requestError.message || "No se pudo eliminar el archivo.");
    } finally {
      setOcupado(null);
    }
  }

  if (!idEquipo) return null;

  return (
    <section className="archivos" aria-labelledby={`${idCampo}-titulo`}>
      <header className="archivos-encabezado">
        <h3 id={`${idCampo}-titulo`}>Archivos del equipo</h3>
        {!cargando && <span className="archivos-contador">{archivos.length}</span>}
      </header>

      {error && (
        <p role="alert" className="archivos-aviso archivos-error">
          {error}
        </p>
      )}
      {mensaje && (
        <p role="status" className="archivos-aviso archivos-exito">
          {mensaje}
        </p>
      )}

      {isAdmin && (
        <form className="archivos-formulario" onSubmit={subir}>
          <label className="archivos-campo archivos-campo-archivo">
            Archivo (PNG, JPEG o PDF · máx. 10 MiB)
            <input
              key={inputKey}
              type="file"
              accept={ACCEPT_ARCHIVOS}
              disabled={subiendo}
              onChange={(event) => {
                setMensaje("");
                setSeleccion(event.target.files?.[0] ?? null);
              }}
            />
          </label>
          <label className="archivos-campo">
            Descripción
            <input
              maxLength={2000}
              value={descripcion}
              disabled={subiendo}
              placeholder="Ej.: vista frontal, manual de uso"
              onChange={(event) => setDescripcion(event.target.value)}
            />
          </label>
          <label className="archivos-check">
            <input type="checkbox" checked={principal} disabled={subiendo} onChange={(e) => setPrincipal(e.target.checked)} />
            Marcar como principal
          </label>
          <button type="submit" className="button button-primary" disabled={subiendo || !seleccion}>
            {subiendo ? "Cargando…" : "Subir archivo"}
          </button>
        </form>
      )}

      <div ref={listaRef}>
        {cargando ? (
          <p role="status" className="archivos-vacio">
            Cargando archivos…
          </p>
        ) : archivos.length === 0 ? (
          <p className="archivos-vacio">Este equipo aún no tiene archivos.</p>
        ) : (
          <ul className="archivos-lista">
            {archivos.map((archivo) => {
              const miniatura = miniaturas[archivo.id_archivo];
              const enCurso = ocupado === archivo.id_archivo;
              return (
                <li key={archivo.id_archivo} className="archivos-tarjeta">
                  <button
                    type="button"
                    className="archivos-vista"
                    onClick={() => abrirVisor(archivo)}
                    aria-label={`Ver ${archivo.nombre_original}`}
                  >
                    {esImagen(archivo) ? (
                      miniatura ? <img src={miniatura} alt="" /> : <span className="archivos-icono">IMG</span>
                    ) : (
                      <span className="archivos-icono archivos-icono-pdf">PDF</span>
                    )}
                    {archivo.principal && <span className="archivos-principal">Principal</span>}
                  </button>
                  <div className="archivos-info">
                    <strong title={archivo.nombre_original}>{archivo.nombre_original}</strong>
                    {archivo.descripcion && <p>{archivo.descripcion}</p>}
                    <small>
                      {formatearTamano(archivo.tamano_bytes)} · {fecha(archivo.fecha_subida)}
                      {archivo.autor && ` · ${archivo.autor}`}
                    </small>
                  </div>
                  <div className="archivos-acciones">
                    <button type="button" onClick={() => abrirVisor(archivo)}>
                      Ver
                    </button>
                    <button type="button" disabled={enCurso} onClick={() => descargar(archivo)}>
                      {enCurso ? "…" : "Descargar"}
                    </button>
                    {isAdmin && (
                      <button type="button" className="archivos-peligro" disabled={enCurso} onClick={() => eliminar(archivo)}>
                        Eliminar
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {visor && (
        <div className="archivos-visor-fondo" onClick={cerrarVisor}>
          <div
            className="archivos-visor"
            role="dialog"
            aria-modal="true"
            aria-label={visor.archivo.nombre_original}
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <strong>{visor.archivo.nombre_original}</strong>
              <div className="archivos-acciones">
                <button type="button" onClick={() => descargar(visor.archivo)}>
                  Descargar
                </button>
                <button type="button" onClick={cerrarVisor} autoFocus>
                  Cerrar
                </button>
              </div>
            </header>
            <div className="archivos-visor-contenido">
              {visor.error ? (
                <p role="alert" className="archivos-aviso archivos-error">
                  {visor.error}
                </p>
              ) : !visor.url ? (
                <p role="status">Cargando vista previa…</p>
              ) : esImagen(visor.archivo) ? (
                <img src={visor.url} alt={visor.archivo.descripcion || visor.archivo.nombre_original} />
              ) : (
                <iframe src={visor.url} title={visor.archivo.nombre_original} />
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default ArchivosEquipo;
