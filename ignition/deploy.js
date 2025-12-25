// Deployment script for DocumentRegistry smart contract
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n========================================");
  console.log("📝 Document Registry Deployment");
  console.log("========================================\n");
  
  console.log("🚀 Starting deployment of DocumentRegistry contract...");
  
  // Get the contract factory
  const DocumentRegistry = await hre.ethers.getContractFactory("DocumentRegistry");
  
  // Deploy the contract
  console.log("⏳ Deploying contract...");
  const documentRegistry = await DocumentRegistry.deploy();
  
  // Wait for deployment to finish
  await documentRegistry.waitForDeployment();
  
  const contractAddress = await documentRegistry.getAddress();
  const network = hre.network.name;
  
  console.log("\n✅ DocumentRegistry contract deployed successfully!");
  console.log("========================================");
  console.log("📍 Contract Address:", contractAddress);
  console.log("🌐 Network:", network);
  console.log("🔗 Chain ID:", hre.network.config.chainId);
  console.log("========================================\n");
  
  console.log("🔑 IMPORTANT: Save this address for your Python connector!");
  console.log("\nYou can interact with this contract using:");
  console.log("- Contract Address:", contractAddress);
  console.log("- Network: Hardhat Local Network (http://127.0.0.1:8545)");
  
  // Save deployment info to a file
  const deploymentInfo = {
    contractName: "DocumentRegistry",
    contractAddress: contractAddress,
    network: network,
    chainId: hre.network.config.chainId,
    deploymentTime: new Date().toISOString(),
    deployer: (await hre.ethers.getSigners())[0].address
  };
  
  const outputPath = path.join(__dirname, "..", "deployment-info.json");
  fs.writeFileSync(
    outputPath,
    JSON.stringify(deploymentInfo, null, 2)
  );
  
  console.log("\n💾 Deployment info saved to deployment-info.json");
  console.log("\n========================================");
  console.log("✨ Deployment Complete!");
  console.log("========================================\n");
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed!");
    console.error("========================================");
    console.error("Error:", error);
    console.error("========================================\n");
    process.exit(1);
  });
