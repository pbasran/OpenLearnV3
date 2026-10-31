let selectedIndex = -1  // Default or initial value

function getSelectedIndex() {
  return selectedIndex
}

function setSelectedIndex(index) {
  selectedIndex = index
  return index
}

const modelDescriptions =
[
  {
    'Index': '0',
    'Modelname': 'gantry_housing',
    'Title': 'Gantry Housing',
    'Description': 'The gantry houses the rotating X-ray tube and detectors, as well as control electronics. Its open circular aperture is where the patient table is positioned. The gantry tilts in some designs, allowing angled imaging to optimize anatomy visualization.',
  },

  {
    'Index': '1',
    'Modelname': 'gantry_ring',
    'Title': 'Gantry Ring',
    'Description': 'The rotating frame supports key imaging components — the X-ray tube and detector array — enabling them to revolve rapidly around the patient for multi-angle projections. High-speed, stable rotation is crucial for minimizing motion artifacts.',
  },

  {
    'Index': '2',
    'Modelname': 'xray_tube',
    'Title': 'X-Ray Tube',
    'Description': 'The X-ray tube generates the fan-shaped X-ray beam used in CT imaging. Electrons are accelerated from the cathode filament to the metal anode, producing X-rays via Bremsstrahlung and characteristic emissions. Cooling systems remove heat generated during rapid exposures.<br><br><i>Animation:</i> with the tube selected, electrons (cyan) leave the heated cathode filament, are accelerated by the tube voltage, and strike the tungsten focal track of the <b>rotating anode</b>; photons are emitted from that focal spot in all directions. Those outside the opening are stopped by the collimator blades; the rest form the fan beam and reach the detector arc. Use <b>Stationary beam demo</b> on the Scan tab to see this with the real fan beam while the gantry is parked (tube at top, no rotation, no table motion).',
  },

  {
    'Index': '3',
    'Modelname': 'detector_array',
    'Title': 'Detector Array',
    'Description': 'The detector array measures the transmitted X-rays after they pass through the patient. Modern detectors use scintillation crystals coupled to photodiodes to convert X-ray energy into digital signals. Detector speed, efficiency, and resolution are central to image quality.',
  },

  {
    'Index': '4',
    'Modelname': 'slip_ring_assembly',
    'Title': 'Slip Ring Assembly',
    'Description': 'Slip rings supply electrical power and transmit data between the stationary and rotating structures of the CT scanner. This innovation allows continuous scanning without cable winding, making spiral (helical) CT possible.',
  },

  {
    'Index': '5',
    'Modelname': 'collimators',
    'Title': 'Collimators',
    'Description': 'Collimators narrow the X-ray beam into a fan or cone shape, reducing radiation outside the imaging region and optimizing slice thickness. Pre-patient collimators shape the beam before it reaches the body, while post-patient collimators reduce scatter before the detectors.',
  },

  {
    'Index': '6',
    'Modelname': 'bore',
    'Title': 'Bore',
    'Description': 'The bore is the opening in the CT scanner through which the patient is positioned. Bore diameter impacts patient comfort and how large a scanning field can be achieved.',
  },

  {
    'Index': '7',
    'Modelname': 'patient_table',
    'Title': 'Patient Table',
    'Description': 'The motorized table moves the patient continuously or incrementally during scanning. Its movement must be precise to synchronize with the X-ray beam for accurate reconstruction, especially in helical scanning.',
  },

  {
    'Index': '8',
    'Modelname': 'couch_top_flat',
    'Title': 'Flat Couch Top (Indexed)',
    'Description': 'A <b>flat</b> carbon-fibre couch top is used for radiotherapy planning CT so the patient lies exactly as on the treatment machine. A curved diagnostic top would change the patient\'s shape and position.\n\n<b>Why carbon fibre?</b> It is strong, stiff and <b>low-attenuation</b> (radiolucent): it adds little to the image and causes few artefacts.\n\n<b>Index marks.</b> The numbered marks along both edges are <b>index positions</b> (every 5 cm; the number is printed every 10 cm). Positioning devices (headrests, knee rests, breast boards, immobilisation masks) lock into the index slots, and the <b>index number is recorded</b> so the set-up can be reproduced at the linac. The ruler down the centre is in cm from the head end of the top.\n\n<b>Lasers.</b> Align the patient\'s skin marks to the red lasers, then note the index and the table height. Try it: turn the lasers on, slide the phantom, and watch the laser line cross the index scale.\n\n<b>Quality checks.</b> The flat top must be level, and the table position read-out should agree with the scale (±1 mm).',
  },

  {
    'Index': '9',
    'Modelname': 'control_console',
    'Title': 'Control Console',
    'Description': 'The control console is operated by the technologist to input scanning protocols, initiate scans, and review preliminary images. Protocol parameters affect dose, image resolution, and scan time.',
  },

  {
    'Index': '10',
    'Modelname': 'image_reconstruction_computer',
    'Title': 'Image Reconstruction Computer',
    'Description': 'High-speed computers process raw projection data into cross-sectional images using mathematical algorithms such as filtered back-projection or iterative reconstruction. Processing speed and algorithm quality directly impact image clarity and diagnostic value.',
  },

  {
    'Index': '11',
    'Modelname': 'control_room',
    'Title': 'Control Room',
    'Description': 'CT technologists operate the scanner from a shielded control room to protect from ionizing radiation, while maintaining visual and audio contact with the patient.',
  },

  {
    'Index': '12',
    'Modelname': 'cooling_system',
    'Title': 'Cooling System',
    'Description': 'CT scanners generate significant heat during operation, primarily at the X-ray tube. Cooling systems (oil or liquid-based) dissipate heat, allowing rapid successive scans without damaging the tube.',
  },

  {
    'Index': '13',
    'Modelname': 'laser_positioning_lights',
    'Title': 'Laser Positioning Lights',
    'Description': 'Laser alignment facilitates precise patient positioning for radiotherapy, which can be adjusted as needed during radiotherapy simulation.',
  },

  {
    'Index': '14',
    'Modelname': 'safety_and_intercom_systems',
    'Title': 'Safety and Intercom Systems',
    'Description': 'These systems enable the operator to communicate with patients during scans, provide instructions, and intervene promptly if necessary.',
  },

]

export {modelDescriptions, getSelectedIndex, setSelectedIndex}
