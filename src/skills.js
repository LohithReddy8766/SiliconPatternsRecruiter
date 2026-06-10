export const ASIC_SKILLS_CATEGORIZED = {
  "Frontend / DV": ["UVM", "SystemVerilog", "Verilog", "VHDL", "Formal", "C", "C++"],
  "DFT": ["DFT", "Scan", "BIST", "MBIST", "JTAG", "IEEE 1500", "IEEE 1687"],
  "Emulation / Low Power": ["ZeBu", "Palladium", "Veloce", "UPF", "CPF"],
  "Backend / PD": ["Floorplanning", "CTS", "Routing", "ECO", "STA", "DRC/LVS", "IR/EM", "Power Signoff", "OPC", "Thermal Analysis", "Aging/BTI", "Noise Analysis", "2.5D Integration", "Multi-Vt Optimization"],
  "Protocols / IO": ["PCIe", "PCIe Gen3", "PCIe Gen4", "PCIe Gen5", "PCIe Gen6", "CXL", "CXL 1.1", "CXL 2.0", "CXL 3.0", "USB", "USB 2.0", "USB 3.0", "USB4", "Ethernet", "Ethernet 1G", "Ethernet 10G", "Ethernet 400G", "SerDes", "SerDes 28G", "SerDes 112G", "SATA", "SATA 3.0", "MIPI", "MIPI CSI-2", "MIPI D-PHY", "UFS", "UFS 3.1", "HDMI", "HDMI 2.1", "DisplayPort", "SDIO", "SPI", "I2C", "NVMe", "UART", "SAS", "Fibre Channel", "Wi-Fi", "Bluetooth LE"],
  "Memory": ["DDR", "DDR2", "DDR3", "DDR4", "DDR5", "LPDDR", "LPDDR3", "LPDDR4", "LPDDR5", "GDDR", "GDDR5", "GDDR6", "GDDR6X", "HBM", "HBM2", "HBM2E", "HBM3", "NAND", "NOR", "eMMC", "NVDIMM", "CXL.mem", "MRAM", "ReRAM", "FRAM", "Optane", "3D XPoint", "WideIO", "SDRAM"],
  "EDA Tools & Languages": ["VCS", "PrimeTime", "Innovus", "Xcelium", "Calibre", "TCL", "Python", "Design Compiler", "SystemC", "ICC2", "HSPICE", "Genus", "Virtuoso", "Spectre", "Tessent", "QuestaSim", "RedHawk", "ADS", "Chisel", "TensorFlow"],
  "Automotive": ["CAN", "CAN-FD", "FlexRay", "LIN", "AUTOSAR", "AUTOSAR Classic", "AUTOSAR Adaptive", "ISO26262", "ASIL", "ASIL A", "ASIL B", "ASIL C", "ASIL D", "Automotive Ethernet", "UDS", "HSM", "SHE", "TPM", "OBD-II", "CHAdeMO", "CCS"],
  "Analog / Mixed Signal": ["OpAmp", "Comparator", "Bandgap Reference", "LDO Regulator", "ADC SAR", "ADC Pipeline", "ADC Sigma-Delta", "DAC R-2R", "DAC Current Steering", "PLL Integer-N", "PLL Fractional-N", "SerDes 56G PAM4", "LNA", "Mixer", "PA", "DLL", "CDR", "VCO", "Time-to-Digital", "Photonics"],
  "Embedded / Software": ["FreeRTOS", "QNX", "VxWorks", "SystemC TLM", "LLVM", "GCC", "Zephyr RTOS", "TCP/IP Stack"],
  "Security / Crypto": ["AES", "AES-128", "AES-256", "RSA", "ECC", "Root of Trust", "PUF", "Kyber", "Dilithium", "SHA", "SHA-3", "TLS", "FIPS 140-3"],
  "AI Accelerators / Cloud": ["CUDA", "ROCm", "Google TPU v2", "TinyML", "Intel Movidius", "AWS Inferentia", "Azure NPU", "Google TPU v4", "OpenCL", "NVIDIA Jetson", "Google Coral TPU", "AWS SageMaker", "ONNX Runtime"],
  "Emerging Tech": ["RISC-V", "Chiplets", "3D-IC", "Neuromorphic", "Quantum", "Photonic ICs", "OpenROAD", "TrueNorth", "Loihi", "Qubits", "Cryo-CMOS", "Spintronics", "CNTFET", "MoS2"],
  "Foundry Nodes / Process": ["180nm", "90nm", "65nm", "45nm", "28nm", "16nm", "7nm", "5nm", "3nm", "FD-SOI", "Legacy Node 350nm", "Legacy Node 250nm", "Advanced Node 2nm", "Future Node 1.4nm", "RF CMOS"]
};

export const ASIC_SKILLS = Object.values(ASIC_SKILLS_CATEGORIZED).flat();
